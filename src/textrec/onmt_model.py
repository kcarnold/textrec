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


PAD_WORD = '<blank>'
UNK = 0
BOS_WORD = '<s>'
EOS_WORD = '</s>'


# NOTE: Tensors generally have dimensions `[seq_len, batch_size, hidden]`


def translate_opts(parser):
    group = parser.add_argument_group('Model')
    group.add_argument('-model', required=False,
                       help='Path to model .pt file')

    group = parser.add_argument_group('Data')
    group.add_argument('-data_type', default="text",
                       help="Type of the source input. Options: [text|img].")
    group.add_argument('-src_dir', default="",
                       help='Source directory for image or audio files')
    group.add_argument('-tgt',
                       help='True target sequence (optional)')
    group.add_argument('-output', default='pred.txt',
                       help="""Path to output the predictions (each line will
                       be the decoded sequence""")

    # Options most relevant to summarization.
    group.add_argument('-dynamic_dict', action='store_true',
                       help="Create dynamic dictionaries")
    group.add_argument('-share_vocab', action='store_true',
                       help="Share source and target vocabulary")

    group = parser.add_argument_group('Beam')
    group.add_argument('-beam_size', type=int, default=5,
                       help='Beam size')

    # Alpha and Beta values for Google Length + Coverage penalty
    # Described here: https://arxiv.org/pdf/1609.08144.pdf, Section 7
    group.add_argument('-alpha', type=float, default=0.,
                       help="""Google NMT length penalty parameter
                        (higher = longer generation)""")
    group.add_argument('-beta', type=float, default=-0.,
                       help="""Coverage penalty parameter""")
    group.add_argument('-max_sent_length', type=int, default=100,
                       help='Maximum sentence length.')
    group.add_argument('-replace_unk', action="store_true",
                       help="""Replace the generated UNK tokens with the
                       source token that had highest attention weight. If
                       phrase_table is provided, it will lookup the
                       identified source token and give the corresponding
                       target token. If it is not provided(or the identified
                       source token does not exist in the table) then it
                       will copy the source token""")

    group = parser.add_argument_group('Logging')
    group.add_argument('-verbose', action="store_true",
                       help='Print scores and predictions for each sentence')
    group.add_argument('-attn_debug', action="store_true",
                       help='Print best attn for each word')
    group.add_argument('-dump_beam', type=str, default="",
                       help='File to dump beam information to.')
    group.add_argument('-n_best', type=int, default=1,
                       help="""If verbose is set, will output the n_best
                       decoded sentences""")

    group = parser.add_argument_group('Efficiency')
    group.add_argument('-batch_size', type=int, default=30,
                       help='Batch size')
    group.add_argument('-gpu', type=int, default=-1,
                       help="Device to run on")

    # Options most relevant to speech.
    group = parser.add_argument_group('Speech')
    group.add_argument('-sample_rate', type=int, default=16000,
                       help="Sample rate.")
    group.add_argument('-window_size', type=float, default=.02,
                       help='Window size for spectrogram in seconds')
    group.add_argument('-window_stride', type=float, default=.01,
                       help='Window stride for spectrogram in seconds')
    group.add_argument('-window', default='hamming',
                       help='Window type for spectrogram generation')


def model_opts(parser):
    """
    These options are passed to the construction of the model.
    Be careful with these as they will be used during translation.
    """

    # Embedding Options
    group = parser.add_argument_group('Model-Embeddings')
    group.add_argument('-src_word_vec_size', type=int, default=500,
                       help='Word embedding size for src.')
    group.add_argument('-tgt_word_vec_size', type=int, default=500,
                       help='Word embedding size for tgt.')
    group.add_argument('-word_vec_size', type=int, default=-1,
                       help='Word embedding size for src and tgt.')

    group.add_argument('-share_decoder_embeddings', action='store_true',
                       help="""Use a shared weight matrix for the input and
                       output word  embeddings in the decoder.""")
    group.add_argument('-share_embeddings', action='store_true',
                       help="""Share the word embeddings between encoder
                       and decoder. Need to use shared dictionary for this
                       option.""")
    group.add_argument('-position_encoding', action='store_true',
                       help="""Use a sin to mark relative words positions.
                       Necessary for non-RNN style models.
                       """)

    group = parser.add_argument_group('Model-Embedding Features')
    group.add_argument('-feat_merge', type=str, default='concat',
                       choices=['concat', 'sum', 'mlp'],
                       help="""Merge action for incorporating features embeddings.
                       Options [concat|sum|mlp].""")
    group.add_argument('-feat_vec_size', type=int, default=-1,
                       help="""If specified, feature embedding sizes
                       will be set to this. Otherwise, feat_vec_exponent
                       will be used.""")
    group.add_argument('-feat_vec_exponent', type=float, default=0.7,
                       help="""If -feat_merge_size is not set, feature
                       embedding sizes will be set to N^feat_vec_exponent
                       where N is the number of values the feature takes.""")

    # Encoder-Deocder Options
    group = parser.add_argument_group('Model- Encoder-Decoder')
    group.add_argument('-model_type', default='text',
                       help="""Type of source model to use. Allows
                       the system to incorporate non-text inputs.
                       Options are [text|img|audio].""")

    group.add_argument('-encoder_type', type=str, default='rnn',
                       choices=['rnn', 'brnn', 'mean', 'transformer', 'cnn'],
                       help="""Type of encoder layer to use. Non-RNN layers
                       are experimental. Options are
                       [rnn|brnn|mean|transformer|cnn].""")
    group.add_argument('-decoder_type', type=str, default='rnn',
                       choices=['rnn', 'transformer', 'cnn'],
                       help="""Type of decoder layer to use. Non-RNN layers
                       are experimental. Options are
                       [rnn|transformer|cnn].""")

    group.add_argument('-layers', type=int, default=-1,
                       help='Number of layers in enc/dec.')
    group.add_argument('-enc_layers', type=int, default=2,
                       help='Number of layers in the encoder')
    group.add_argument('-dec_layers', type=int, default=2,
                       help='Number of layers in the decoder')
    group.add_argument('-rnn_size', type=int, default=500,
                       help='Size of rnn hidden states')
    group.add_argument('-cnn_kernel_width', type=int, default=3,
                       help="""Size of windows in the cnn, the kernel_size is
                       (cnn_kernel_width, 1) in conv layer""")

    group.add_argument('-input_feed', type=int, default=1,
                       help="""Feed the context vector at each time step as
                       additional input (via concatenation with the word
                       embeddings) to the decoder.""")

    group.add_argument('-rnn_type', type=str, default='LSTM',
                       choices=['LSTM', 'GRU'],
                       help="""The gate type to use in the RNNs""")
    # group.add_argument('-residual',   action="store_true",
    #                     help="Add residual connections between RNN layers.")
    group.add_argument('-brnn_merge', default='concat',
                       choices=['concat', 'sum'],
                       help="Merge action for the bidir hidden states")

    group.add_argument('-context_gate', type=str, default=None,
                       choices=['source', 'target', 'both'],
                       help="""Type of context gate to use.
                       Do not select for no context gate.""")

    # Attention options
    group = parser.add_argument_group('Model- Attention')
    group.add_argument('-global_attention', type=str, default='general',
                       choices=['dot', 'general', 'mlp'],
                       help="""The attention type to use:
                       dotprod or general (Luong) or MLP (Bahdanau)""")

    # Genenerator and loss options.
    group.add_argument('-copy_attn', action="store_true",
                       help='Train copy attention layer.')
    group.add_argument('-copy_attn_force', action="store_true",
                       help='When available, train to copy.')
    group.add_argument('-coverage_attn', action="store_true",
                       help='Train a coverage attention layer.')
    group.add_argument('-lambda_coverage', type=float, default=1,
                       help='Lambda value for coverage.')


def var(a): return Variable(a, volatile=True)


def rvar(a, beam_size): return var(a.repeat(1, beam_size, 1))


class ONMTmodelAPI():
    def __init__(self, cmdline_args, model_loc, gpu=-1, beam_size=5, k=5):
        # Simulate all commandline args
        parser = argparse.ArgumentParser(
            description='translate.py',
            formatter_class=argparse.ArgumentDefaultsHelpFormatter)
        translate_opts(parser)
        self.opt = parser.parse_known_args(cmdline_args)[0]
        self.opt.model = model_loc
        self.opt.beam_size = beam_size
        self.opt.batch_size = 1
        self.opt.n_best = k

        dummy_parser = argparse.ArgumentParser(description='train.py')
        model_opts(dummy_parser)
        self.dummy_opt = dummy_parser.parse_known_args([])[0]

        # Load the model.
        self.fields, self.model, self.model_opt = \
            onmt.ModelConstructor.load_test_model(
                self.opt, self.dummy_opt.__dict__)

        # Make GPU decoding possible
        self.opt.gpu = gpu
        self.opt.cuda = self.opt.gpu > -1
        if self.opt.cuda:
            torch.cuda.set_device(self.opt.gpu)

        # Translator
        self.scorer = onmt.translate.GNMTGlobalScorer(
            self.opt.alpha,
            self.opt.beta)
        self.translator = onmt.translate.Translator(
            self.model, self.fields,
            beam_size=self.opt.beam_size,
            n_best=self.opt.n_best,
            global_scorer=self.scorer,
            max_length=self.opt.max_sent_length,
            copy_attn=self.model_opt.copy_attn,
            cuda=self.opt.cuda,
            beam_trace=self.opt.dump_beam != "")

    def encode(self, in_text):
        # Set batch size to number of requested translations
        self.opt.batch_size = len(in_text)
        # Workaround until we have API that does not require files
        with codecs.open("tmp.txt", "w", "utf-8") as f:
            for line in in_text:
                f.write(line + "\n")

        # Use written file as input to dataset builder
        input_dataset = onmt.io.build_dataset(
            self.fields, self.opt.data_type,
            "tmp.txt", self.opt.tgt,
            src_dir=self.opt.src_dir,
            sample_rate=self.opt.sample_rate,
            window_size=self.opt.window_size,
            window_stride=self.opt.window_stride,
            window=self.opt.window,
            use_filter_pred=False)

        # Iterating over the single batch... torchtext requirement
        test_data = onmt.io.OrderedIterator(
            dataset=input_dataset, device=self.opt.gpu,
            batch_size=self.opt.batch_size, train=False, sort=False,
            sort_within_batch=True,
            shuffle=False)

        batch = next(iter(test_data))

        src = onmt.io.make_features(batch, 'src', 'text')
        _, src_lengths = batch.src

        # Encode source text
        enc_states, context = self.model.encoder(src, src_lengths)
        # enc_states: final encoder state: `[layers x batch x hidden]`
        # context: contexts for attention, `[src_len x batch x hidden]`

        return dict(
            batch=batch,
            src=src,
            input_dataset=input_dataset,
            context=context,
            enc_states=enc_states,
            )

    def decode(self, enc_state, partial_decode):
        batch = enc_state['batch']
        src = enc_state['src']
        input_dataset = enc_state['input_dataset']
        context = enc_state['context']
        enc_states = enc_state['enc_states']

        _, src_lengths = batch.src
        src_map = rvar(batch.src_map.data, 1)

        # Initialize the decoder
        initial_dec_states = self.translator.model.decoder.init_decoder_state(
            src, context, enc_states)

        # Convert partial decode into valid input to decoder
        tgt_vocab = self.fields["tgt"].vocab

        partial = [tgt_vocab.stoi[tok] for tok in partial_decode]

        # Feed the states so far into the decoder.
        tgt_in = Variable(
            torch.LongTensor(partial) # [tgt_len]
            .unsqueeze(1) # [tgt_len x batch=1]
            .unsqueeze(1) # [tgt_len x batch=1 x nfeats=1]
            )

        dec_out, dec_states, attn = self.translator.model.decoder(
            tgt_in, context, initial_dec_states, context_lengths=src_lengths)

        # We now have the hidden states of the decoder throughout the sequence.
        # dec_out: [tgt_len x batch x hidden]
        # Discard intermediate decoder outputs; keep only the last.
        assert dec_out.shape[0] == len(partial)
        dec_out = dec_out[-1:, :, :]

        # The "generator" converts a decoder hidden state into vocab logits.
        # It expects tensors in a different format from the decoder:
        # the sequence length and the batch are collapsed.
        dec_out = dec_out.squeeze(0)

        if self.translator.copy_attn:
            # The copy attention is [tgt_len x batch x src_len],
            # but we need just the last tgt.
            copy_attn = attn['copy'][-1]
            assert copy_attn.shape[0] == 1
            logits = self.model.generator.forward(
                dec_out,
                copy_attn,
                src_map)
            # We have potential duplicate vocab entries: the copy attention
            # could have selected a word that's also in the base target
            # vocabulary. Collapse these.
            # Here we go back to the usual convention:
            # tgt_length x batch x vocab
            logits = input_dataset.collapse_copy_scores(
                logits.data.unsqueeze(0),
                batch, tgt_vocab, input_dataset.src_vocabs)
            vocab = tgt_vocab.itos + input_dataset.src_vocabs[0].itos
            logits = logits.log()
            assert logits.shape[0] == 1
            logits = logits.squeeze(0)
        else:
            logits = self.model.generator.forward(dec_out).data
            vocab = tgt_vocab
        assert logits.shape[0] == 1
        logits = logits.squeeze(0)
        return logits, vocab

    def get_top_k(self, logits, vocab, k, prefix=None):
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
  'cnndm_sum': dict(
    filename='ada5_acc_49.81_ppl_12.70_e16.pt', # 'cnndm_sum_acc_49.59_ppl_14.37_e15.pt',
    # filename="model-copy_acc_51.78_ppl_11.71_e20.pt",
    args='-replace_unk -alpha 0.9 -beta .25'),
  'cnndm_lm': dict(
    filename='cnndm_lm_acc_27.76_ppl_86.49_e20.pt',
    args=''),
  'coco_lm': dict(
    filename='coco_lm_acc_44.56_ppl_18.76_e20.pt',
    args=''),
}
models = dict()
for name, spec in model_specs.items():
    print(spec['filename'])
    models[name] = ONMTmodelAPI(
        spec['args'].split(),
        str(paths.models / spec['filename'])
    )
print("Ready.")

def get_recs(model_name, encoder_state, tokens_so_far, *, prefix=None):
    model = models[model_name]
    logits, vocab = model.decode(
        encoder_state, [onmt.io.BOS_WORD] + tokens_so_far)
    return model.get_top_k(logits, vocab, k=3, prefix=prefix)
