import numpy as np
from .util import mem
from . import onmt_model_2
import spacy

print("Loading SpaCy...", end='', flush=True)
nlp = spacy.load('en_core_web_sm')
print("done")

@mem.cache(verbose=0)
def count_adj(text):
    return sum(1 for token in nlp(text) if token.pos_ == 'ADJ')


@mem.cache
def eval_logprobs_conditional(image_id, text):
    wrapper = onmt_model_2.models['coco_cap']
    tokens = onmt_model_2.tokenize(text)
    logprobs = wrapper.eval_logprobs(str(image_id), tokens, use_eos=True)
    return np.mean(logprobs)

@mem.cache
def eval_logprobs_unconditional(text):
    wrapper = onmt_model_2.models['coco_lm']
    tokens = onmt_model_2.tokenize(text)
    logprobs = wrapper.eval_logprobs('.', tokens, use_eos=True)
    return np.mean(logprobs)

@mem.cache
def taps_to_type(stimulus, txt, threshold=None):
    if stimulus is None:
        def rec_gen(context, prefix=None):
            return onmt_model_2.get_recs('coco_lm', '.', context, prefix=prefix)
    else:
        def rec_gen(context, prefix=None):
            return onmt_model_2.get_recs('coco_cap', str(stimulus), context, prefix=prefix)

    actions = []
    # Invariant: performing [actions] types txt[:idx]
    idx = 0
    while idx < len(txt):
        sofar = txt[:idx]
        if ' ' in sofar:
            last_space_idx = sofar.rindex(' ')
        else:
            last_space_idx = -1
        prefix = sofar[:last_space_idx + 1]
        cur_word = sofar[last_space_idx + 1:]
        cur_desired_word = txt[last_space_idx + 1:].split(' ', 1)[0]
#         if cur_desired_word[-1] in ',.;-':
#             cur_desired_word = cur_desired_word[:-1]
#         print(repr(prefix), repr(cur_word), repr(cur_desired_word))
        recs = rec_gen(onmt_model_2.tokenize(prefix), prefix=cur_word)
        words = [word for word, rec in recs]
        if threshold is not None:
            show_recs = max(prob for word, prob in recs if prob is not None) > threshold
            if not show_recs:
                words = []
        # print(prefix, words)
        if cur_desired_word in words:
            actions.append(dict(type='rec', which=words.index(cur_desired_word), word=cur_desired_word))
            idx = last_space_idx + 1 + len(cur_desired_word) + 1
        else:
            actions.append(dict(type='key', key=txt[idx]))
            idx += 1
        # print(actions[-1])
    return actions


def all_taps_to_type(stimulus, text, prefix):
    res = dict(
        norecs=len(text),
        general=len(taps_to_type(None, text)),
        specific=len(taps_to_type(stimulus, text)),
        gated=len(taps_to_type(None, text, threshold=-0.989417552947998)),
        always=len(taps_to_type(None, text)),
    )
    return {f'{prefix}tapstotype_{k}': v for k, v in res.items()}
