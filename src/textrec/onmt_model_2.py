from .paths import paths

import argparse
import codecs
import torch

from torch.autograd import Variable

import onmt.io
import onmt.translate
import onmt
import onmt.ModelConstructor
import onmt.modules
import onmt.opts as opts

# HACK!!
import sys
sys.modules['onmt.modules.VecsEncoder'].override_h5_filename = str(paths.models / 'trainval_feats.small.h5')

class ONMTModelWrapper:
    def __init__(self, model_filename, cmdline_args):
        parser = argparse.ArgumentParser(
            description='translate.py',
            formatter_class=argparse.ArgumentDefaultsHelpFormatter)
        opts.add_md_help_argument(parser)
        opts.translate_opts(parser)
        opt = parser.parse_args(['-model', model_filename, '-src', ''] + (cmdline_args or []))

        dummy_parser = argparse.ArgumentParser(description='train.py')
        opts.model_opts(dummy_parser)
        dummy_opt = dummy_parser.parse_args([])
        fields, model, model_opt = \
            onmt.ModelConstructor.load_test_model(opt, dummy_opt.__dict__)

        opt.cuda = False

        scorer = onmt.translate.GNMTGlobalScorer(opt.alpha,
                                                 opt.beta,
                                                 opt.coverage_penalty,
                                                 opt.length_penalty)
        translator = onmt.translate.Translator(
            model, fields,
            beam_size=opt.beam_size,
            n_best=opt.n_best,
            global_scorer=scorer,
            max_length=opt.max_length,
            copy_attn=model_opt.copy_attn,
            cuda=opt.cuda,
            beam_trace=opt.dump_beam != "",
            min_length=opt.min_length,
            stepwise_penalty=opt.stepwise_penalty)

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


        def generate_completions(encoder_out, partial):
            enc_states = encoder_out['enc_states']
            memory_bank = encoder_out['memory_bank']
            src = encoder_out['src']

            initial_dec_states = translator.model.decoder.init_decoder_state(
                src, memory_bank, enc_states)

            tgt_vocab = fields["tgt"].vocab

            partial_vec = [tgt_vocab.stoi[tok] for tok in partial]

            # Feed the states so far into the decoder.
            tgt_in = Variable(
                torch.LongTensor(partial_vec) # [tgt_len]
                .unsqueeze(1) # [tgt_len x batch=1]
                .unsqueeze(1), # [tgt_len x batch=1 x nfeats=1]
                volatile=True
                )

            dec_out, dec_states, attn = translator.model.decoder(
                tgt_in, memory_bank, initial_dec_states)

            assert dec_out.shape[0] == len(partial)
            dec_out = dec_out[-1:, :, :]

            dec_out = dec_out.squeeze(0)

            logits = model.generator.forward(dec_out).data
            vocab = tgt_vocab.itos

            assert logits.shape[0] == 1
            logits = logits[0]
            return logits, vocab

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
    filename='coco_lm_acc_44.84_ppl_17.58_e20.pt',
    args='',),
  'coco_cap': dict(
    filename='coco_cap_2_acc_42.97_ppl_18.83_e20.pt',
    args='-data_type vecs',
    # h5_filename='/Users/kcarnold/code/OpenNMT-py-me/train36_small.hdf5'
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


def get_recs(model_name, encoder_state, tokens_so_far, *, prefix=None):
    wrapper = models[model_name]
    logits, vocab = wrapper.generate_completions(
        encoder_state, [onmt.io.BOS_WORD] + tokens_so_far)
    return get_top_k(logits, vocab, k=3, prefix=prefix)


if __name__ == '__main__':
    model_filename = '/Users/kcarnold/code/textrec/models/coco_cap_2_acc_42.97_ppl_18.83_e20.pt'
    wrapper = ONMTModelWrapper(model_filename, ['-data_type', 'vecs'])
    encoder_out = wrapper.encode('1')
    logits, vocab = wrapper.generate_completions(encoder_out, [onmt.io.BOS_WORD, 'airplane'])
    print(get_top_k(logits, vocab, 5))

