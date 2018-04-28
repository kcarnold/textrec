import json
from collections import Counter, defaultdict
import toolz
import nltk
import numpy as np
from scipy.special import logsumexp

from sklearn.linear_model import LogisticRegression
#from sklearn.svm import LinearSVC

#%%
images = json.load(open('/Users/kcarnold/src/ImageCaptioning.pytorch/data/dataset_coco.json'))['images']
Counter(img['split'] for img in images)
# In[4]:
images_by_split = toolz.groupby('split', images)
# In[7]:
def coco_url(cocoid):
    return f'http://images.cocodataset.org/train2017/{cocoid:012d}.jpg'
# In[10]:
from textrec import lang_model
# In[11]:
from importlib import reload
reload(lang_model)
# In[27]:
if False:
    lang_model.dump_kenlm(
        'coco_train',
        [' '.join(sentence['tokens']) for img in images_by_split['train'] for sentence in img['sentences']])


# In[12]:
model = lang_model.Model.get_or_load_model('coco_train')
# In[30]:
model.score_seq(model.bos_state, 'a person standing inside of a phone booth'.split())
# In[31]:
model.score_seq(model.bos_state, 'a group of people'.split())
# In[17]:
example_captions = [
    'plate with pancakes topped with banana slices, bacon, and blackberries, in front of a mug and maple syrup',
    'a plate with blueberries, bacon, and pancakes topped with bananas',
]
# In[94]:
def tokenize(caption):
    # FIXME: Karpathy seems to have killed commas and periods.
    return ["<s>"] + nltk.word_tokenize(caption.replace(',', ' ').replace('.', ' '))


# In[96]:

# 1. Pop a context
# 2. Generate 10 possible suggestions
# 3. Have annotator pick all the ones that are good suggestions.
# 4. Record the raw results (for later playing with ranking learning)
# 5. Record all good suggestions as 1, bad suggestions as 0.
#

# In[99]:
assert model.id2str[:3] == ['<unk>', '<s>', '</s>']

# In[101]:
def next_word_distribution_ngram(model, toks):
    state = model.get_state(toks, bos=True)[0]
    logprobs = model.eval_logprobs_for_words(state, range(len(model.id2str)))
    logprobs[:3] = -1e99
    logprobs -= logsumexp(logprobs)
    return logprobs


# In[258]:
class Suggestr:
    def __init__(self, base_model, examples):
        self.base_model = base_model
        dataset = defaultdict(dict)
        for cap in examples:
            toks = tokenize(cap)
            for idx in range(1, len(toks)):
                context = ' '.join(toks[:idx])
                tok = toks[idx]
                dataset[context][tok] = 1
        self.dataset = dataset

    def add_data(self, context, recs, labels):
        assert len(recs) == len(labels)
        for tok, label in zip(recs, labels):
            self.dataset[context][tok] = label


    def train_classifier(self):
        words_for_unigram_feats = sorted(word for words in self.dataset.values() for word in words.keys())
        self.word2unigram_feat_idx = {word: idx for idx, word in enumerate(words_for_unigram_feats)}

        one_hot_words = np.diag(np.ones(len(words_for_unigram_feats)))
        no_hot = np.zeros(len(words_for_unigram_feats))

        def _featurize(ngram_dist, word):
            word_idx = self.base_model.model.vocab_index(word)
            assert word_idx != 0, word
            if word in self.word2unigram_feat_idx:
                unigram_feat = one_hot_words[self.word2unigram_feat_idx[word]]
            else:
                unigram_feat = no_hot
            return np.r_[
                ngram_dist[word_idx],
                unigram_feat
            ]
        self._featurize = _featurize

        X = []
        y = []
        examples = []
        for context, words in self.dataset.items():
            ngram_dist = next_word_distribution_ngram(self.base_model, context.split())
            for word, label in words.items():
                examples.append((context, word, label))
                X.append(_featurize(ngram_dist, word))
                y.append(int(label))
        X = np.array(X)
        y = np.array(y)
        self.examples = examples

        self.clf = LogisticRegression().fit(X, y)
        predictions = self.clf.predict(X)
        diffs = np.flatnonzero(predictions != y)
        if len(diffs):
            print("Warning: classifier underfit")
            for idx in diffs:
                c, w, l = examples[idx]
                print(c, w, l, predictions[idx])

    def featurize(self, context_toks, toks):
        _featurize = self._featurize
        ngram_dist = next_word_distribution_ngram(self.base_model, context_toks)
        return np.array([_featurize(ngram_dist, tok) for tok in toks])

    def generate_recs(self, context, n=10):
        context_toks = context.split()
        candidates = [
                model.id2str[id]
                for id in model.filtered_bigrams[model.model.vocab_index(context_toks[-1])]]
        feature_vecs = self.featurize(context_toks, candidates)
        clf_logprobs = self.clf.predict_proba(feature_vecs)[:,1]
        return [candidates[i] for i in np.argsort(clf_logprobs)[-n:]]


sugr = Suggestr(model, example_captions)
sugr.add_data(
        '<s>',
        'this some several people three there an the two a'.split(),
        [0, 1, 0, 0, 0, 1, 0, 0, 0, 1])
sugr.add_data(
        '<s> a',
        'sitting fence on wave is in of a and with'.split(),
        [0, 0, 0, 0, 0, 0, 0, 0, 0, 0])
sugr.add_data(
        '<s> a',
        'white small couple young large group person woman man plate'.split(),
        [1, 0, 0, 0, 1, 0, 0, 0, 0, 1])
sugr.add_data(
        '<s> a plate',
        'holds containing has filled full that and of topped with'.split(),
        [0, 0, 0, 0, 0, 0, 0, 1, 0, 1])
sugr.add_data(
        '<s> a plate with',
        'different pizza meat broccoli white food with bananas some a'.split(),
        [0, 0, 0, 0, 0, 0, 0, 1, 1, 0])
sugr.add_data(
        '<s> a plate with',
        'white vegetables fruit various large carrots with a bananas some'.split(),
        [0, 0, 0, 0, 0, 0, 0, 1, 1, 1])
sugr.train_classifier()
' '.join(sugr.generate_recs(context='<s> a plate with'))
#%%
' '.join(sugr.generate_recs(context='<s>'))


