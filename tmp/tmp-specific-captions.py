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
#%%
from IPython.display import Image
Image(coco_url(236272))
#%%
training_captions = [
    (0, 'A baseball player swinging his bat at a baseball game.'),
    (0, 'A baseball player has just swung his bat.'),
    (0, 'A baseball hitter swinging his bat during a baseball game.'),
    (0, 'A baseball player playing on a baseball field.'),
    (0, 'A baseball batter swinging at a baseball pitch.'),
    (1, 'A man with white pants, a black and red shirt, and a black hat just swung a baseball bat as people in white and blue look on from behind a blue wall.'),
    (1, 'A baseball hitter just swung his black, red, and white bat.')
]

# In[17]:
example_captions = [
    (1, 'plate with pancakes topped with banana slices, bacon, and blackberries, in front of a mug and maple syrup'),
    (1, 'a plate with blueberries, bacon, and pancakes topped with bananas'),
    (0, 'a man'),
    (0, 'a person'),
]
# In[94]:
def tokenize(caption):
    # FIXME: Karpathy seems to have killed commas and periods.
    return ["<s>"] + nltk.word_tokenize(caption.lower().replace(',', ' ').replace('.', ' '))


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
        for label, cap in examples:
            toks = tokenize(cap)
            if any(model.model.vocab_index(tok) == 0 for tok in toks):
                print("Skipping example", cap)
                continue
            for idx in range(1, len(toks)):
                context = ' '.join(toks[:idx])
                tok = toks[idx]
                dataset[context][tok] = label
        self.dataset = dataset

    def add_data(self, context, recs, labels):
        if isinstance(recs, str):
            recs = recs.split()
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
                model.unigram_probs[word_idx],
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
                print(f'{c}: {w} label={l} predicted={predictions[idx]}')

    def featurize(self, context_toks, toks):
        _featurize = self._featurize
        ngram_dist = next_word_distribution_ngram(self.base_model, context_toks)
        return np.array([_featurize(ngram_dist, tok) for tok in toks])

    def generate_recs(self, context, n=10):
        if isinstance(context, str):
            context = context.split()
        candidates = [
                model.id2str[id]
                for id in model.filtered_bigrams[model.model.vocab_index(context[-1])]]
        feature_vecs = self.featurize(context, candidates)
        clf_logprobs = self.clf.predict_proba(feature_vecs)[:,1]
        return [candidates[i] for i in np.argsort(clf_logprobs)[-n:][::-1]]

    def generate_phrase_recs(self, context, n=3, k=3):
        if isinstance(context, str):
            context = context.split()
        hypotheses = [context]
        for i in range(k):
            new_hypotheses = []
            for ctx in hypotheses:
                if ctx[-1] == '</s>':
                    new_hypotheses.append(ctx)
                    continue
                for rec in self.generate_recs(ctx, n=n):
                    new_hypotheses.append(ctx + [rec])
            hypotheses = new_hypotheses
        return hypotheses
#%%

sugr = Suggestr(model, [
    (1, 'plate with pancakes topped with banana slices, bacon, and blackberries, in front of a mug and maple syrup'),
    (1, 'a plate with blueberries, bacon, and pancakes topped with bananas'),
    (1, 'white plate with pancakes, bacon, and blackberries'),
    (0, 'a man'),
    (0, 'a person')
])
sugr.add_data(
        '<s>',
        'and bananas motorcycles fresh snow living big zebra surfer stuffed',
        [0, 1, 0, 0, 0, 0, 0, 0, 0, 0])
sugr.add_data(
        '<s>',
        'plate bananas two the white an there three in people',
        [1, 1, 0, 0, 1, 0, 0, 0, 0, 0])
sugr.add_data(
        '<s> plate with',
        'with bananas white and',
        [0, 1, 0, 0])
sugr.add_data(
        '<s> plate of',
        'with bananas food',
        [0, 0, 1])
#sugr.add_data(
#        '<s>',
#        'this some several people three there an the two a'.split(),
#        [0, 1, 0, 0, 0, 1, 0, 0, 0, 1])
#sugr.add_data(
#        '<s> a',
#        'sitting fence on wave is in of a and with'.split(),
#        [0, 0, 0, 0, 0, 0, 0, 0, 0, 0])
#sugr.add_data(
#        '<s> a',
#        'white small couple young large group person woman man plate'.split(),
#        [1, 0, 0, 0, 1, 0, 0, 0, 0, 1])
#sugr.add_data(
#        '<s> a plate',
#        'holds containing has filled full that and of topped with'.split(),
#        [0, 0, 0, 0, 0, 0, 0, 1, 0, 1])
#sugr.add_data(
#        '<s> a plate with',
#        'different pizza meat broccoli white food with bananas some a'.split(),
#        [0, 0, 0, 0, 0, 0, 0, 1, 1, 0])
#sugr.add_data(
#        '<s> a plate with',
#        'white vegetables fruit various large carrots with a bananas some'.split(),
#        [0, 0, 0, 0, 0, 0, 0, 1, 1, 1])
sugr.train_classifier()
#' '.join(sugr.generate_recs(context='<s>'))
sugr.generate_phrase_recs(context='<s>')
#%%
' '.join(sugr.generate_recs(context='<s> plate with pancakes topped with'))
#%%
' '.join(sugr.generate_recs(context='<s> a'))

#%%
valid_imgs = images_by_split['val']
perm = np.random.RandomState(0).permutation(len(valid_imgs))
neg_examples = [sent['raw'] for idx in perm[:30] for sent in valid_imgs[idx]['sentences']]
neg_examples
#%%
sugr = Suggestr(model, [
    (0, 'A baseball player swinging his bat at a baseball game.'),
    (1, 'A baseball player has just swung his bat.'),
    (0, 'A baseball hitter swinging his bat during a baseball game.'),
    (0, 'A baseball player playing on a baseball field.'),
    (0, 'A baseball batter swinging at a baseball pitch.'),
    (1, 'A man with white pants, a black and red shirt, and a black hat just swung a baseball bat as people in white and blue look on from behind a blue wall.'),
    (1, 'A baseball hitter just swung his black, red, and white bat.'),
    (0, 'A young man holding an umbrella next to a herd of cattle.'),
    (0, 'A baseball player swinging his bat in front of a crowd.'),
    (0, 'A man and a woman sitting on a bench'),
    (0, 'A white, black, and blue sign'),
    (0, 'A red traffic light')
] + [(0, sent) for sent in neg_examples])
sugr.add_data(
        '<s>',
        'and',
        [0])
sugr.train_classifier()
sugr.generate_phrase_recs(context='<s>')