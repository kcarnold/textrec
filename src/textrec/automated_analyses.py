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
