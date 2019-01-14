from collections import defaultdict
import numpy as np
import heapq
import os
import sys
import string
import datrie
import nltk
import itertools
import subprocess
from scipy.misc import logsumexp
LOG10 = np.log(10)

import kenlm

from .paths import paths


def get_arpa_data(filename):
    with open(filename) as f:
        # read unigrams, for vocab
        while not f.readline().startswith('\\1-grams:'):
            continue
        vocab = []
        unigram_probs = []
        for line in f:
            line = line.strip()
            if not line:
                break  # end of 1-grams
            parts = line.split('\t')
            unigram_probs.append(float(parts[0]))
            vocab.append(parts[1])

        while not f.readline().startswith('\\2-grams:'):
            continue
        bigrams = defaultdict(list)
        for line in f:
            line = line.strip()
            if not line:
                break  # end of 2-grams
            parts = line.split('\t')
            prob = float(parts[0])
            a, b = parts[1].split(' ')
            bigrams[a].append((prob, b))

        return vocab, np.array(unigram_probs) * LOG10, bigrams


def encode_bigrams(bigrams, model):
    encoded_bigrams = {}
    for prev, nexts in bigrams.items():
        prev_id = model.vocab_index(prev)
        next_ids = []
        for prob, b in nexts:
            next_id = model.vocab_index(b)
            next_ids.append((prob, next_id))
        encoded_bigrams[prev_id] = next_ids
    def pull_2nd(lst):
        return [x[1] for x in lst]
    unfiltered_bigrams = {a: pull_2nd(nexts) for a, nexts in encoded_bigrams.items()}
    # Most common bigrams (sorted by probability)
    filtered_bigrams = {a: pull_2nd(heapq.nlargest(100, nexts)) for a, nexts in encoded_bigrams.items()}
    return unfiltered_bigrams, filtered_bigrams



class Model:
    preloaded = {}
    @classmethod
    def preload_model(cls, name):
        basename = paths.models / name
        model_file = f'{basename}.kenlm'
        arpa_file = f'{basename}.arpa'
        assert os.path.exists(model_file), model_file
        assert os.path.exists(arpa_file), arpa_file
        cls.preloaded[name] = cls(name=name, model_file=model_file, arpa_file=arpa_file)

    @classmethod
    def get_model(cls, name: str) -> 'Model':
        try:
            return cls.preloaded[name]
        except IndexError:
            raise Exception(f"The requested model `{name}` was not preloaded.")

    @classmethod
    def get_or_load_model(cls, name: str) -> 'Model':
        if name not in cls.preloaded:
            cls.preload_model(name)
        return cls.get_model(name)


    def __init__(self, name, model_file, arpa_file):
        self.name = name
        self.model_file = model_file
        self.arpa_file = arpa_file
        self._load()

    def __reduce__(self):
        return Model.get_or_load_model, (self.name,)

    def _load(self):
        print("Loading model", self.name, '...', file=sys.stderr, end='')
        self.model = kenlm.LanguageModel(self.model_file)

        print(" reading raw ARPA data ... ", file=sys.stderr, end='')
        self.id2str, self.unigram_probs, bigrams = get_arpa_data(self.arpa_file)
        self.is_special = np.zeros(len(self.id2str), dtype=bool)
        for i, word in enumerate(self.id2str):
            assert self.model.vocab_index(word) == i, i
            if word[0] not in string.ascii_lowercase:
                self.is_special[i] = True
        # Since we give rare-word bonuses, count special words as super-common.
        self.unigram_probs_wordsonly = self.unigram_probs.copy()
        self.unigram_probs_wordsonly[self.is_special] = 0
        # ... but for finding the most common fallback words, count special words as impossible.
        unigram_probs_wordsonly_2 = self.unigram_probs.copy()
        unigram_probs_wordsonly_2[self.is_special] = -np.inf
        self.most_common_words_by_idx = np.argsort(unigram_probs_wordsonly_2)[-500:]
        print(" Encoding bigrams to indices... ", file=sys.stderr, end='')
        self.unfiltered_bigrams, self.filtered_bigrams = encode_bigrams(bigrams, self.model)

        # Vocab trie
        self.vocab_trie = datrie.BaseTrie(set(itertools.chain.from_iterable(self.id2str)))
        for i, s in enumerate(self.id2str):
            self.vocab_trie[s] = i

        self.eos_idx = self.model.vocab_index('</S>')
        self.eop_idx = self.model.vocab_index('</s>')
        print("Loaded.", file=sys.stderr)

    def prune_bigrams(self):
        # Filter bigrams to only include words that actually follow
        bigrams = self.unfiltered_bigrams
        while True:
            new_bigrams = {k: [tok for tok in v if len(bigrams.get(tok, [])) > 0] for k, v in bigrams.items()}
            new_bigrams_trim = {k: v for k, v in new_bigrams.items() if len(v) > 0}
            if len(new_bigrams) == len(new_bigrams_trim):
                break
            bigrams = new_bigrams_trim
        self.unfiltered_bigrams = bigrams

    def _compute_pos(self):
        print("Computing pos tags")
        pos_tags = [nltk.pos_tag([w or "UNK"], tagset='universal')[0][1] for w in self.id2str]
        self._id2tag = sorted(set(pos_tags))
        tag2id = {tag: id for id, tag in enumerate(self._id2tag)}
        self._pos_tags = np.array([tag2id[tag] for tag in pos_tags])

    @property
    def pos_tags(self):
        if not hasattr(self, '_pos_tags'):
            self._compute_pos()
        return self._pos_tags

    @property
    def id2tag(self):
        if not hasattr(self, '_id2tag'):
            self._compute_pos()
        return self._id2tag

    @property
    def word_lengths(self):
        if not hasattr(self, '_word_lengths'):
            self._word_lengths = np.array([len(w) if w is not None else 0 for w in self.id2str])
        return self._word_lengths

    @property
    def bos_state(self):
        state = kenlm.State()
        self.model.BeginSentenceWrite(state)
        return state

    @property
    def null_context_state(self):
        state = kenlm.State()
        self.model.NullContextWrite(state)
        return state

    def get_state(self, words, bos=False):
        if bos:
            state = self.bos_state
        else:
            state = self.null_context_state
        score, state = self.score_seq(state, words)
        return state, score

    def score_seq(self, state, words):
        score = 0.
        for word in words:
            new_state = kenlm.State()
            score += self.model.base_score_from_idx(state, self.model.vocab_index(word), new_state)
            state = new_state
        return score * LOG10, state

    def score_seq_by_word(self, state, words):
        scores = []
        for word in words:
            new_state = kenlm.State()
            scores.append(LOG10 * self.model.base_score_from_idx(state, self.model.vocab_index(word), new_state))
            state = new_state
        return scores

    def advance_state(self, state, tok):
        new_state = kenlm.State()
        return new_state, LOG10 * self.model.base_score_from_idx(state, self.model.vocab_index(tok), new_state)

    def next_word_logprobs_raw(self, state, prev_word, prefix_logprobs=None):
        bigrams = self.unfiltered_bigrams
        if prefix_logprobs is not None:
            next_words = []
            prior_logprobs = []
            for logprob, prefix in prefix_logprobs:
                for word, word_idx in self.vocab_trie.items(prefix):
                    next_words.append(word_idx)
                    prior_logprobs.append(logprob)
        else:
            next_words = bigrams.get(self.model.vocab_index(prev_word), [])
            if len(next_words) == 0:
                next_words = bigrams.get(self.model.vocab_index('<S>'), [])
            next_words = [w for w in next_words if w != self.eos_idx and w != self.eop_idx]
        if len(next_words) == 0:
            return [], np.zeros(0)
        logprobs = self.eval_logprobs_for_words(state, next_words)
        if prefix_logprobs is not None:
            logprobs += prior_logprobs
        return next_words, logprobs

    def eval_logprobs_for_words(self, state, next_words):
        new_state = kenlm.State()
        logprobs = np.empty(len(next_words))
        for next_idx, word_idx in enumerate(next_words):
            logprobs[next_idx] = self.model.base_score_from_idx(state, word_idx, new_state)
        logprobs *= LOG10
        return logprobs



def dump_kenlm(model_name, tokenized_sentences, **model_args):
    # Dump tokenized sents / docs, one per line,
    # to a file that KenLM can read, and build a model with it.
    with open(paths.models / '{}.txt'.format(model_name), 'w') as f:
        for toks in tokenized_sentences:
            assert isinstance(toks, str)
            print(toks, file=f)
    make_model(model_name, **model_args)


def make_model(model_name, order=5, prune=2):
    model_full_name = str(paths.models / model_name)
    kenlm_bin = paths.top_level.parent / 'kenlm' / 'build' / 'bin'
    lmplz_args = ['-o', str(order)]
    if prune is not None:
        lmplz_args.append('--prune')
        lmplz_args.append(str(prune))
    lmplz_args.append('--verbose_header')
    in_file_name = model_full_name + '.txt'
    arpa_file_name = model_full_name + '.arpa'
    bin_file_name = model_full_name + '.kenlm'
    with open(in_file_name, 'rb') as in_file, open(arpa_file_name, 'wb') as arpa_file:
        lmplz_cmd = [str(kenlm_bin / 'lmplz')] + lmplz_args
        print("Running", ' '.join(lmplz_cmd), "<", in_file_name, ">", arpa_file_name)
        subprocess.run(
            lmplz_cmd,
            stdin=in_file, stdout=arpa_file,
            check=True)
    build_binary_cmd = [str(kenlm_bin / 'build_binary'), arpa_file_name, bin_file_name]
    print("Running", ' '.join(build_binary_cmd))
    subprocess.run(
        build_binary_cmd,
        check=True)
    print("Done")




from collections import namedtuple
BeamEntry = namedtuple("BeamEntry", 'score, words, done, penultimate_state, last_word_idx, num_chars, extra')

def beam_search_phrases_init(model, start_words, **kw):
    if isinstance(model, str):
        model = get_model(model)
    start_state, start_score = model.get_state(start_words, bos=True)
    return [(0., [], False, start_state, model.model.vocab_index(start_words[-1]), 0, None)]


def beam_search_phrases_extend(model, beam, *, iteration_num, beam_width, length_after_first, prefix_logprobs=None, bonus_words={}):
    if isinstance(model, str):
        model = get_model(model)

    bigrams = model.unfiltered_bigrams if iteration_num == 0 else model.filtered_bigrams
    DONE = 2
    new_beam = [ent for ent in beam if ent[DONE]]
    new_beam_size = len(new_beam)
    for entry in beam:
        score, words, done, penultimate_state, last_word_idx, num_chars, _ = entry
        if done:
            continue
        else:
            if iteration_num > 0:
                last_state = kenlm.State()
                model.model.base_score_from_idx(penultimate_state, last_word_idx, last_state)
            else:
                last_state = penultimate_state

            # Get candidate words to evaluate.
            probs = None
            if iteration_num == 0 and prefix_logprobs is not None:
                next_words = []
                probs = []
                for prob, prefix in prefix_logprobs:
                    for word, word_idx in model.vocab_trie.items(prefix):
                        next_words.append(word_idx)
                        probs.append(prob)
            else:
                # print(id2str[last_word])
                next_words = bigrams.get(last_word_idx, [])
                if len(next_words) < 10:
                    if iteration_num == 0:
                        # Fall back to all common words.
                        next_words = model.most_common_words_by_idx
                    else:
                        # Use the larger set of possible next words
                        next_words = model.unfiltered_bigrams.get(last_word_idx, [])
                        if len(next_words) < 10:
                            next_words = model.most_common_words_by_idx

            # Evaluate candidate words.
            new_state = kenlm.State()
            for next_idx, word_idx in enumerate(next_words):
                # Never end sentences.
                if word_idx == model.eos_idx or word_idx == model.eop_idx:
                    continue
                if probs is not None:
                    prob = probs[next_idx]
                else:
                    prob = 0.
                word = model.id2str[word_idx]
                if word[0] in '.?!':
                    continue
                if word in words:
                    # Don't double-bonus.
                    bonus = 0.
                else:
                    bonus = bonus_words.get(word, 0.)

                main_model_score = LOG10 * model.model.base_score_from_idx(last_state, word_idx, new_state)
                new_score = score + prob + main_model_score + bonus
                new_words = words + [word]
                new_num_chars = num_chars + 1 + len(word) if iteration_num else 0
                done = new_num_chars >= length_after_first

                # Add this new entry to the beam.
                new_entry = (new_score, new_words, done, last_state, word_idx, new_num_chars, None)
                if new_beam_size == beam_width:
                    heapq.heappushpop(new_beam, new_entry)
                    # Beam size unchanged.
                else:
                    new_beam.append(new_entry)
                    new_beam_size += 1
                    if new_beam_size == beam_width:
                        heapq.heapify(new_beam)
                # assert len(new_beam) <= beam_width
    return new_beam


def beam_search_phrases_loop(model, beam, *, length_after_first, prefix_logprobs=None, start_idx=0, **kw):
    for iteration_num in range(start_idx, length_after_first):
        beam = beam_search_phrases_extend(model, beam, iteration_num=iteration_num, length_after_first=length_after_first,
            prefix_logprobs=prefix_logprobs, **kw)
        prefix_logprobs = None
    return [BeamEntry(*ent) for ent in sorted(beam, reverse=True)]


def beam_search_phrases(model, start_words, **kw):
    beam = beam_search_phrases_init(model, start_words, **kw)
    beam = beam_search_phrases_loop(model, beam, **kw)
    beam.sort(reverse=True)
    return [BeamEntry(*ent) for ent in beam]
