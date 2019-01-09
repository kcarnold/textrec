import attr
import cytoolz
import joblib
import numpy as np
import tqdm
import logging
logger = logging.getLogger(__name__)

from .paths import paths
from .util import dump_kenlm
from . import lang_model

CNNB_JOBLIB = str(paths.models / 'conceptnet-numberbatch-201609-en.joblib')

@attr.s
class ConceptNetNumberBatch:
    term2id = attr.ib()
    id2term = attr.ib()
    vecs = attr.ib()
    ndim = attr.ib()

    @staticmethod
    def extract_english(h5_filename='/Data/ConceptNetNumberBatch/conceptnet-numberbatch-mini-1706.h5'):
        import h5py
        with h5py.File(h5_filename) as f:
            labels = f['mat']['axis1'].value
            en_labels = [lbl[6:].decode('utf8') for idx, lbl in enumerate(labels) if lbl.startswith(b'/c/en/')]
            en_indices = [idx for idx, lbl in enumerate(labels) if lbl.startswith(b'/c/en/')]
            en_vecs = f['mat']['block0_values'][en_indices]
            vecs = normalize_vecs(en_vecs.astype(float))
            return dict(labels=en_labels, vecs=en_vecs)

    @classmethod
    def save_joblib(cls):
        joblib.dump(cls.extract_english(), CNNB_JOBLIB)

    @classmethod
    def load(cls, filename=CNNB_JOBLIB):
        data = joblib.load(filename, mmap_mode='r')
        id2term = data['labels']
        term2id = {term: idx for idx, term in enumerate(id2term)}
        vecs = data['vecs']
        return cls(vecs=vecs, term2id=term2id, id2term=id2term, ndim=vecs.shape[1])

    def __getitem__(self, item):
        return self.vecs[self.term2id[item]]

    def __contains__(self, item):
        return item in self.term2id


cnnb = None


def flatten_sents(tokenized_docs):
    """
    Concatenate sentences from all tokenized docs.
    Assumes that sentences in tokenized docs are separated by newlines (\n)
    """
    return list(cytoolz.concat(doc.split('\n') for doc in tokenized_docs))


def filter_reasonable_length_sents(sents, min_percentile=25, max_percentile=75):
    """
    Return only sentences with reasonable length, defined as 25-to-75%ile.
    """
    sent_lens = np.array([len(sent.split()) for sent in sents])
    min_sent_len, max_sent_len = np.percentile(sent_lens, [min_percentile, max_percentile])
    return [sent for sent in sents if min_sent_len <= len(sent.split()) <= max_sent_len]


def get_vectorizer(sents):
    from sklearn.feature_extraction.text import TfidfVectorizer
    vectorizer = TfidfVectorizer(min_df=5, max_df=.5, stop_words='english')
    all_vecs = vectorizer.fit_transform(sents)
    return vectorizer, all_vecs


def get_projection_mat(vectorizer):
    import wordfreq

    global cnnb
    if cnnb is None:
        cnnb = ConceptNetNumberBatch.load()

    sklearn_vocab = vectorizer.get_feature_names()
    def get_or_zero(cnnb, item):
        try:
            return cnnb[item]
        except KeyError:
            return np.zeros(cnnb.ndim)
    cnnb_vecs_for_sklearn_vocab = np.array([get_or_zero(cnnb, word) for word in sklearn_vocab])
    wordfreqs_for_sklearn_vocab = [wordfreq.word_frequency(word, 'en', 'large', minimum=1e-9) for word in sklearn_vocab]
    return -np.log(wordfreqs_for_sklearn_vocab)[:,None] * cnnb_vecs_for_sklearn_vocab


def filter_by_norm(vecs, texts, min_norm=.5):
    norms = np.linalg.norm(vecs, axis=1)
    large_enough = norms > min_norm
    vecs = vecs[large_enough] / norms[large_enough][:,None]
    texts = [texts[i] for i in np.flatnonzero(large_enough)]
    return texts, vecs

# Clustering sentences

def get_clusterer_and_dists(sentence_vecs, n_clusters, random_state):
    from sklearn.cluster import MiniBatchKMeans
    clusterer = MiniBatchKMeans(init='k-means++', n_clusters=n_clusters, n_init=10, random_state=random_state)
    distance_to_centers = clusterer.fit_transform(sentence_vecs)
    return clusterer, distance_to_centers

def summarize_clusters(doc_texts, cluster_dists):
    for c in range(cluster_dists.shape[1]):
        print(c)
        for i in np.argsort(cluster_dists[:,c])[:10]:
            print(i, doc_texts[i].replace('\n', ' '))
        print()

def train_lms_per_cluster(clusterer, vecs, texts):
    """
    Train a language model for each cluster.
    """
    sentences_in_cluster = [[] for i in range(clusterer.n_clusters)]
    for i, c in enumerate(clusterer.predict(vecs)):
        sentences_in_cluster[c].append(texts[i])
    for cluster_idx, cluster in enumerate(sentences_in_cluster):
        print(cluster_idx)
        dump_kenlm('cluster_{}'.format(cluster_idx), [s.lower() for s in cluster])


def normalize_vecs(vecs):
    return vecs / (np.linalg.norm(vecs, axis=1, keepdims=True) + 1e-7)

def normalize_dists(dists):
    return dists / np.sum(dists, axis=1, keepdims=True)

# Bind all of that together into a single pickleable object

@attr.s
class Clusterizer:
    n_clusters = attr.ib()
    vectorizer = attr.ib()
    projection_mat = attr.ib()
    clusterer = attr.ib()
    unique_starts = attr.ib()
    scores_by_cluster = attr.ib()

    @classmethod
    def build(cls, tokenized_docs, n_clusters=10):
        params = {}
        params['n_clusters'] = n_clusters

        logger.info("Flattening and filtering sentences")
        sents = filter_reasonable_length_sents(flatten_sents(tokenized_docs))

        logger.info("Vectorizing")
        params['vectorizer'], raw_vecs = get_vectorizer(sents)
        params['projection_mat'] = get_projection_mat(params['vectorizer'])
        vecs = raw_vecs.dot(params['projection_mat'])
        sents, projected_vecs = filter_by_norm(vecs, sents)

        logger.info("Clustering")
        params['clusterer'], cluster_dists = get_clusterer_and_dists(projected_vecs, n_clusters=n_clusters, random_state=0)

        logger.info("Training sub-models")
        train_lms_per_cluster(params['clusterer'], vecs=projected_vecs, texts=sents)

        models = [lang_model.Model.get_or_load_model(f'cluster_{cluster_idx}') for cluster_idx in range(n_clusters)]

        # Score the first 5 words of every sentence.
        unique_starts = params['unique_starts'] = [
            x.split() for x in sorted({' '.join(sent.split()[:5]) for sent in sents})]
        params['scores_by_cluster'] = np.array([
            [model.score_seq(model.bos_state, k)[0] for model in models]
            for k in tqdm.tqdm(unique_starts, desc="Score starts")])
#         params['omit_unks'] = np.flatnonzero([
#             [any(model.model.vocab_index(tok) == 0 for tok in toks) for model in models]
#             for toks in unique_starts])
        return cls(**params)

    def vectorize_sents(self, sents):
        return self.vectorizer.transform(sents).dot(self.projection_mat)


## Predict next 