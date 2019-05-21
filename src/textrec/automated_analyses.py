from collections import Counter

import numpy as np
import spacy
import wordfreq

from textrec.paths import paths

from .util import mem

# Computed by compute_gating_threshold. See also GatedCapTask.js
GATING_THRESHOLD = -0.989417552947998

paths.imgdata_h5 = paths.imgdata_h5_all

print("Loading SpaCy...", end='', flush=True)
nlp = spacy.load('en_core_web_md')
print("done")

@mem.cache(verbose=0)
def count_adj(text):
    return sum(1 for token in nlp(text) if token.pos_ == 'ADJ')

@mem.cache(verbose=0)
def pos_counts(text):
    return Counter(token.pos_ for token in nlp(text))

@mem.cache
def wordfreqs(text):
    freqs = []
    for tok in wordfreq.tokenize(text, 'en'):
        freq = wordfreq.zipf_frequency(tok, 'en')
        if freq != 0:
            freqs.append(freq)
    return np.array(freqs)


def mean_log_freq(text):
    return np.mean(wordfreqs(text))


def total_rarity(text):
    rarities = 1 - wordfreqs(text) / 7.
    return np.sum(rarities)


@mem.cache
def eval_logprobs_conditional(image_id, text):
    from . import onmt_model_2

    wrapper = ont_model_2.models['coco_cap']
    tokens = onmt_model_2.tokenize(text)
    logprobs = wrapper.eval_logprobs(str(image_id), tokens, use_eos=True)
    return np.mean(logprobs)

@mem.cache
def eval_logprobs_unconditional(text):
    from . import onmt_model_2

    wrapper = onmt_model_2.models['coco_lm']
    tokens = onmt_model_2.tokenize(text)
    logprobs = wrapper.eval_logprobs('.', tokens, use_eos=True)
    return np.mean(logprobs)

@mem.cache
def taps_to_type(stimulus, txt, threshold=None):
    from . import onmt_model_2

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
            actions.append(dict(type='rec', which=words.index(cur_desired_word), word=cur_desired_word, cur_word=cur_word))
            idx = last_space_idx + 1 + len(cur_desired_word) + 1
        else:
            actions.append(dict(type='key', key=txt[idx], cur_word=cur_word))
            idx += 1
        actions[-1]['recs_shown'] = len(words) > 0
        # print(actions[-1])
    return actions


def all_taps_to_type(stimulus, text, prefix):
    # taps_to_type is broken wrt word-ending punctuation. Hack around that.
    text_without_punct = text.replace('.', '').replace(',', '')
    num_punct = len(text) - len(text_without_punct)
    taps_by_cond = dict(
        norecs=[dict(type='key', key=c) for c in text_without_punct],
        standard=taps_to_type(None, text_without_punct),
        contextual=taps_to_type(stimulus, text_without_punct),
        gated=taps_to_type(None, text_without_punct, threshold=GATING_THRESHOLD),
    )
    res = {}
    for condition, taps in taps_by_cond.items():
        res[f'{prefix}tapstotype_{condition}'] = len(taps) + num_punct
        res[f'{prefix}idealrecuse_{condition}'] = len([action for action in taps if action['type'] == 'rec'])
        if condition != 'norecs':
            beginning_of_word_actions = [action for action in taps if action['cur_word'] == '']
            res[f'{prefix}bow_recs_offered_{condition}'] = len([action for action in beginning_of_word_actions if action['recs_shown']])
            res[f'{prefix}bow_recs_idealuse_{condition}'] = len([action for action in beginning_of_word_actions if action['type'] == 'rec'])
    return res
