from .paths import paths

import argparse
import codecs
import torch
import numpy as np
import copy

from torch.autograd import Variable
import torch.nn.functional as F

import onmt
import onmt.io
from onmt.translate.Translator import make_translator
import onmt.ModelConstructor
import onmt.modules
import onmt.opts as opts

from functools import lru_cache

# HACK - monkey-patch, because the model stores the wrong data here.
def fake_open_h5_file(self):
    num_objs = 36
    feature_dim = 2048
    return num_objs, feature_dim

def load_img_data(self, coco_ids):
    coco_ids = coco_ids.data.numpy().tolist()
    import h5py
    with h5py.File(str(paths.imgdata_h5), 'r') as f:
        batch_size = len(coco_ids)
        vecs = np.empty((batch_size, self.num_objs, self.feature_dim))
        for i, idx in enumerate(coco_ids):
            vecs[i] = f[str(idx)][:]

        # Features need to be first, since they're analogous to words.
        vecs = vecs.transpose(1, 0, 2)
        # vecs: objs x batch_size x feature_dim

        return torch.FloatTensor(vecs)


onmt.modules.VecsEncoder._open_h5_file = fake_open_h5_file
onmt.modules.VecsEncoder.load_h5_data = load_img_data


from nltk.tokenize.moses import MosesTokenizer
mtokenizer = MosesTokenizer()

def tokenize(text):
    return mtokenizer.tokenize(text)


@lru_cache()
def tokenize_stimulus(stimulus):
    return ' '.join(tokenize(stimulus))




class ONMTModelWrapper:
    def __init__(self, model_filename, cmdline_args):
        parser = argparse.ArgumentParser(
            description='translate.py',
            formatter_class=argparse.ArgumentDefaultsHelpFormatter)
        opts.add_md_help_argument(parser)
        opts.translate_opts(parser)
        opt = parser.parse_args(
            ['-model', model_filename, '-src', ''] + (cmdline_args or []))

        translator = make_translator(opt)
        model = translator.model
        fields = translator.fields
        tgt_vocab = fields["tgt"].vocab

        def encode_from_src(src):
            enc_states, memory_bank = model.encoder(src)
            return dict(
                enc_states=enc_states,
                memory_bank=memory_bank,
                src=src)

        @lru_cache(maxsize=32)
        def encode_text(in_text):
            text_preproc = fields['src'].preprocess(in_text)
            src, src_len = fields['src'].process([text_preproc], device=-1, train=False)
            src = src.unsqueeze(2) # not sure why
            return encode_from_src(src)


        @lru_cache(maxsize=32)
        def encode_img(image_idx):
            if isinstance(image_idx, str):
                image_idx = int(image_idx)
            src = Variable(torch.IntTensor([image_idx]), volatile=True)
            return encode_from_src(src)

        def encode(inp):
            if model.encoder.__class__.__name__ == 'VecsEncoder':
                return encode_img(inp)
            else:
                return encode_text(inp)

        @lru_cache(maxsize=128)
        def get_decoder_state(in_text, tokens_so_far):
            encoder_out = encode(in_text)
            enc_states = encoder_out['enc_states']
            memory_bank = encoder_out['memory_bank']
            src = encoder_out['src']

            if len(tokens_so_far) == 0:
                return None, translator.model.decoder.init_decoder_state(
                    src, memory_bank, enc_states)

            prev_out, prev_state = get_decoder_state(in_text, tokens_so_far[:-1])

            tgt_in = Variable(
                torch.LongTensor([tgt_vocab.stoi[tokens_so_far[-1]]]),
                volatile=True) # [tgt_len]
            tgt_in = tgt_in.unsqueeze(1)  # [tgt_len x batch=1]
            tgt_in = tgt_in.unsqueeze(1)  # [tgt_len x batch=1 x nfeats=1]

            # Prepare to call the decoder. Unfortunately the decoder mutates the state passed in!
            memory_bank = copy.deepcopy(memory_bank)
            assert isinstance(prev_state.hidden, tuple)
            prev_state.hidden = tuple(v.detach() for v in prev_state.hidden)
            prev_state = copy.deepcopy(prev_state)

            assert memory_bank.size()[1] == 1

            dec_out, dec_states, attn = translator.model.decoder(
                tgt_in, memory_bank, prev_state)

            assert dec_out.shape[0] == 1
            return dec_out[0], dec_states

        def generate_completions(in_text, tokens_so_far):
            tokens_so_far = [onmt.io.BOS_WORD] + tokens_so_far
            tokens_so_far = tuple(tokens_so_far) # Make it hashable
            dec_out, dec_states = get_decoder_state(in_text, tokens_so_far)
            logits = model.generator.forward(dec_out).data
            vocab = tgt_vocab.itos

            assert logits.shape[0] == 1
            logits = logits[0]
            return logits, vocab

        def eval_logprobs(in_text, tokens, *, use_eos):
            encoder_out = encode(in_text)
            enc_states = encoder_out['enc_states']
            memory_bank = encoder_out['memory_bank']
            src = encoder_out['src']

            tokens = [onmt.io.BOS_WORD] + tokens
            if use_eos:
                tokens = tokens + [onmt.io.EOS_WORD]

            decoder_state = model.decoder.init_decoder_state(src, memory_bank=memory_bank, encoder_final=enc_states)
            tgt = Variable(torch.LongTensor([tgt_vocab.stoi[tok] for tok in tokens]).unsqueeze(1).unsqueeze(1))
            dec_out, dec_states, attn = model.decoder(tgt[:-1], memory_bank, decoder_state)
            logits = model.generator(dec_out)
            return F.nll_loss(logits.squeeze(1), tgt[1:].squeeze(1).squeeze(1), reduce=False, size_average=False).data.numpy()

        self.model = model
        self.fields = fields
        self.translator = translator
        self.encode = encode
        self.get_decoder_state = get_decoder_state
        self.generate_completions = generate_completions
        self.eval_logprobs = eval_logprobs


def logsumexp(tensor: torch.Tensor,
              dim: int = -1,
              keepdim: bool = False) -> torch.Tensor:
    # Borrowed from https://github.com/allenai/allennlp/blob/d47ac92f1f7fcd905618f4c928f5b95556a2997c/allennlp/nn/util.py#L554
    # until we upgrade to PyTorch 0.4.

    """
    A numerically stable computation of logsumexp. This is mathematically equivalent to
    `tensor.exp().sum(dim, keep=keepdim).log()`.  This function is typically used for summing log
    probabilities.

    Parameters
    ----------
    tensor : torch.FloatTensor, required.
        A tensor of arbitrary size.
    dim : int, optional (default = -1)
        The dimension of the tensor to apply the logsumexp to.
    keepdim: bool, optional (default = False)
        Whether to retain a dimension of size one at the dimension we reduce over.
    """
    max_score, _ = tensor.max(dim, keepdim=keepdim)
    if keepdim:
        stable_vec = tensor - max_score
    else:
        stable_vec = tensor - max_score.unsqueeze(dim)
    return max_score + (stable_vec.exp().sum(dim, keepdim=keepdim)).log()



def get_top_k(logits, vocab, k, prefix=None):
    if prefix is not None:
        offset = torch.FloatTensor(
            [1000.0 * (not x.startswith(prefix)) for x in vocab])
        logits = logits - offset
        logits -= logsumexp(logits)
    result = []
    for idx in logits.topk(k * 2)[1]:
        word = vocab[idx]
        # TODO: run this filter before the logsumexp
        if word[0] == '<' or word[0] == '.':
            continue
        logit = logits[idx]
        if logit > -100.:
            result.append((word, logit))
        else:
            break
        if len(result) == k:
            break
    return result


print("Loading ONMT models...")
model_specs = {
  # 'cnndm_sum': dict(
  #   filename='ada5_acc_49.81_ppl_12.70_e16.pt', # 'cnndm_sum_acc_49.59_ppl_14.37_e15.pt',
  #   # filename="model-copy_acc_51.78_ppl_11.71_e20.pt",
  #   args='-replace_unk -alpha 0.9 -beta .25'),
  # 'cnndm_lm': dict(
  #   filename='cnndm_lm_acc_27.76_ppl_86.49_e20.pt',
  #   args=''),
  'coco_lm': dict(
    #filename='coco_lm_acc_44.56_ppl_18.76_e20.pt',
    # filename='coco_lm_acc_44.84_ppl_17.58_e20.pt',
    filename='coco_lm_adam_acc_46.00_ppl_16.32_e10_nooptim.pt',
    args='',),
  'coco_cap': dict(
    # filename='coco_cap_2_acc_42.97_ppl_18.83_e20.pt',
    filename='coco_cap_adam_acc_48.73_ppl_12.56_e10_nooptim.pt',
    args='-data_type vecs',
    )
}
models = dict()
for name, spec in model_specs.items():
    print(spec['filename'])
    models[name] = ONMTModelWrapper(
        model_filename=str(paths.models / spec['filename']),
        cmdline_args=spec['args'].split(),
    )
print("Ready.")


def get_recs(model_name, in_text, tokens_so_far, *, prefix=None):
    wrapper = models[model_name]
    logits, vocab = wrapper.generate_completions(in_text, tokens_so_far)
    return get_top_k(logits, vocab, k=3, prefix=prefix)
