from .paths import paths

import argparse
import codecs
import torch

from torch.autograd import Variable

import onmt
import onmt.io
from onmt.translate.Translator import make_translator
import onmt.ModelConstructor
import onmt.modules
import onmt.opts as opts

from functools import lru_cache

# HACK!!
import sys
sys.modules['onmt.modules.VecsEncoder'].override_h5_filename = str(paths.models / 'trainval_feats.small.h5')

def main(opt):
    translator = make_translator(opt, report_score=True)
    translator.translate(opt.src_dir, opt.src, opt.tgt,
                         opt.batch_size, opt.attn_debug)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description='translate.py',
        formatter_class=argparse.ArgumentDefaultsHelpFormatter)
    onmt.opts.add_md_help_argument(parser)
    onmt.opts.translate_opts(parser)

    opt = parser.parse_args()
    main(opt)



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


        @lru_cache(maxsize=32)
        def encode(in_text):
            with codecs.open("tmp.txt", "w", "utf-8") as f:
                f.write(in_text + "\n")


            input_dataset = onmt.io.build_dataset(
                fields, opt.data_type,
                "tmp.txt", opt.tgt,
                src_dir=opt.src_dir,
                sample_rate=opt.sample_rate,
                window_size=opt.window_size,
                window_stride=opt.window_stride,
                window=opt.window,
                use_filter_pred=False)

            # Iterating over the single batch... torchtext requirement
            test_data = onmt.io.OrderedIterator(
                dataset=input_dataset, device=opt.gpu,
                batch_size=opt.batch_size, train=False, sort=False,
                sort_within_batch=True,
                shuffle=False)

            batch = next(iter(test_data))

            src = onmt.io.make_features(batch, 'src', opt.data_type)

            enc_states, memory_bank = model.encoder(src)
            return dict(
                enc_states=enc_states,
                memory_bank=memory_bank,
                src=src)


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

            dec_out, dec_states, attn = translator.model.decoder(
                tgt_in, memory_bank, prev_state)

            assert dec_out.shape[0] == 1
            return dec_out[0], dec_states

        def generate_completions(in_text, tokens_so_far):
            tokens_so_far = tuple(tokens_so_far) # Make it hashable
            dec_out, dec_states = get_decoder_state(in_text, tokens_so_far)
            logits = model.generator.forward(dec_out).data
            vocab = tgt_vocab.itos

            assert logits.shape[0] == 1
            logits = logits[0]
            return logits, vocab

        self.model = model
        self.fields = fields
        self.translator = translator
        self.encode = encode
        self.generate_completions = generate_completions


def get_top_k(logits, vocab, k, prefix=None):
    if prefix is not None:
        offset = torch.FloatTensor(
            [100.0 * (not x.startswith(prefix)) for x in vocab])
        logits = logits - offset
    result = []
    for idx in logits.topk(k * 2)[1]:
        word = vocab[idx]
        if word[0] == '<':
            continue
        result.append(word)
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
    logits, vocab = wrapper.generate_completions(
        in_text, [onmt.io.BOS_WORD] + tokens_so_far)
    return get_top_k(logits, vocab, k=3, prefix=prefix)


if __name__ == '__main__':
    model_filename = '/Users/kcarnold/code/textrec/models/coco_cap_2_acc_42.97_ppl_18.83_e20.pt'
    wrapper = ONMTModelWrapper(model_filename, ['-data_type', 'vecs'])
    encoder_out = wrapper.encode('1')
    logits, vocab = wrapper.generate_completions(encoder_out, [onmt.io.BOS_WORD, 'airplane'])
    print(get_top_k(logits, vocab, 5))

