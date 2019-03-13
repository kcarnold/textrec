import logging
import pickle

from .numberbatch_vecs import get_cnnb
import cytoolz
import numpy as np
import tqdm
from scipy.special import logsumexp
from functools import lru_cache

from . import lang_model
from .paths import paths
from .util import dump_kenlm, mem

logger = logging.getLogger(__name__)


def flatten_sents(tokenized_docs):
    """
    Concatenate sentences from all tokenized docs.
    Assumes that sentences in tokenized docs are separated by newlines (\n)
    """
    return list(cytoolz.concat(doc.split("\n") for doc in tokenized_docs))


def filter_reasonable_length_sents(sents, min_percentile=25, max_percentile=75):
    """
    Return only sentences with reasonable length, defined as 25-to-75%ile.
    """
    sent_lens = np.array([len(sent.split()) for sent in sents])
    min_sent_len, max_sent_len = np.percentile(
        sent_lens, [min_percentile, max_percentile]
    )
    return [sent for sent in sents if min_sent_len <= len(sent.split()) <= max_sent_len]


def get_vectorizer(sents):
    from sklearn.feature_extraction.text import TfidfVectorizer

    vectorizer = TfidfVectorizer(min_df=5, max_df=0.5, stop_words="english")
    all_vecs = vectorizer.fit_transform(sents)
    return vectorizer, all_vecs


def get_projection_mat(vectorizer, normalize_by_wordfreq=True):
    import wordfreq

    cnnb = get_cnnb()

    sklearn_vocab = vectorizer.get_feature_names()

    def get_or_zero(cnnb, item):
        try:
            return cnnb[item]
        except KeyError:
            return np.zeros(cnnb.ndim)

    cnnb_vecs_for_sklearn_vocab = np.array(
        [get_or_zero(cnnb, word) for word in sklearn_vocab]
    )

    if normalize_by_wordfreq:
        wordfreqs_for_sklearn_vocab = [
            wordfreq.word_frequency(word, "en", "large", minimum=1e-9)
            for word in sklearn_vocab
        ]
        return (
            -np.log(wordfreqs_for_sklearn_vocab)[:, None] * cnnb_vecs_for_sklearn_vocab
        )
    else:
        return cnnb_vecs_for_sklearn_vocab


def filter_by_norm(vecs, texts, min_norm=0.5):
    norms = np.linalg.norm(vecs, axis=1)
    large_enough = norms > min_norm
    vecs = vecs[large_enough] / norms[large_enough][:, None]
    indices = np.flatnonzero(large_enough)
    texts = [texts[i] for i in indices]
    return texts, vecs, indices


# Clustering sentences


def get_clusterer_and_dists(sentence_vecs, n_clusters, random_state):
    from sklearn.cluster import MiniBatchKMeans

    clusterer = MiniBatchKMeans(
        init="k-means++", n_clusters=n_clusters, n_init=10, random_state=random_state
    )
    distance_to_centers = clusterer.fit_transform(sentence_vecs)
    return clusterer, distance_to_centers


def summarize_clusters(doc_texts, cluster_dists):
    for c in range(cluster_dists.shape[1]):
        print(c)
        for i in np.argsort(cluster_dists[:, c])[:10]:
            print(i, doc_texts[i].replace("\n", " "))
        print()


def train_lms_per_cluster(clusterer, vecs, texts, model_basename):
    """
    Train a language model for each cluster.
    """
    sentences_in_cluster = [[] for i in range(clusterer.n_clusters)]
    for i, c in enumerate(clusterer.predict(vecs)):
        sentences_in_cluster[c].append(texts[i])
    for cluster_idx, cluster in enumerate(sentences_in_cluster):
        print(cluster_idx)
        dump_kenlm(
            "{}_{}".format(model_basename, cluster_idx), [s.lower() for s in cluster]
        )


def normalize_dists(dists):
    return dists / np.sum(dists, axis=1, keepdims=True)


# Bind all of that together into cacheable objects


@lru_cache()
@mem.cache
def cached_dataset(name):
    if name == "yelp":
        with open(paths.top_level / "preproc/yelp/train_data.pkl", "rb") as f:
            return pickle.load(f)["data"]
    raise NameError("Unknown dataset " + name)


@lru_cache()
@mem.cache
def cached_reasonable_length_sents(dataset_name):
    tokenized_docs = cached_dataset(dataset_name).tokenized
    return filter_reasonable_length_sents(flatten_sents(tokenized_docs))


@lru_cache()
@mem.cache
def cached_vectorizer_and_projections(dataset_name):
    sents = cached_reasonable_length_sents(dataset_name)
    vectorizer, raw_vecs = get_vectorizer(sents)
    projection_mat = get_projection_mat(vectorizer)
    vecs = raw_vecs.dot(projection_mat)
    new_sents, projected_vecs, filtered_indices = filter_by_norm(vecs, sents)
    return {
        "vectorizer": vectorizer,
        "projection_mat": projection_mat,
        "filtered_sents": new_sents,
        "projected_vecs": projected_vecs,
        "filtered_indices": filtered_indices,
    }


@lru_cache()
@mem.cache
def cached_clusterer(dataset_name, n_clusters):
    projections_data = cached_vectorizer_and_projections(dataset_name)
    projected_vecs = projections_data["projected_vecs"]
    clusterer, cluster_dists = get_clusterer_and_dists(
        projected_vecs, n_clusters=n_clusters, random_state=0
    )
    return {"clusterer": clusterer, "cluster_dists": cluster_dists}


@lru_cache()
@mem.cache
def cached_lms_per_cluster(dataset_name, n_clusters):
    # Get data.
    projections_data = cached_vectorizer_and_projections(dataset_name)
    clusterer_data = cached_clusterer(dataset_name, n_clusters)
    clusterer = clusterer_data["clusterer"]
    sents = projections_data["filtered_sents"]
    projected_vecs = projections_data["projected_vecs"]

    # Train models (shells out to KenLM)
    model_basename = f"{dataset_name}_{n_clusters}"
    train_lms_per_cluster(
        clusterer, vecs=projected_vecs, texts=sents, model_basename=model_basename
    )

    # Load models
    return [
        lang_model.Model.get_or_load_model(f"{model_basename}_{cluster_idx}")
        for cluster_idx in range(n_clusters)
    ]


@lru_cache()
@mem.cache
def cached_unique_starts(dataset_name, n_words):
    # Score the first 5 words of every sentence.
    projections_data = cached_vectorizer_and_projections(dataset_name)
    sents = projections_data["filtered_sents"]

    if n_words is None:
        # Special-case: Use all vocab.
        return sorted({tok for sent in sents for tok in sent.split()})
    else:
        return [
            x.split()
            for x in sorted({" ".join(sent.split()[:n_words]) for sent in sents})
        ]


@lru_cache()
@mem.cache
def cached_scores_by_cluster(dataset_name, n_clusters, n_words=5):
    unique_starts = cached_unique_starts(dataset_name, n_words=n_words)
    models = cached_lms_per_cluster(dataset_name, n_clusters)
    return (
        np.array(
            [
                [model.score_seq(model.bos_state, k)[0] for model in models]
                for k in tqdm.tqdm(unique_starts, desc="Score starts")
            ]
        ).T,
        unique_starts,
    )


#         params['omit_unks'] = np.flatnonzero([
#             [any(model.model.vocab_index(tok) == 0 for tok in toks) for model in models]
#             for toks in unique_starts])


def get_cached_vectorizer(dataset_name):
    projections_data = cached_vectorizer_and_projections(dataset_name)
    vectorizer = projections_data["vectorizer"]
    projection_mat = projections_data["projection_mat"]

    def vectorize_sents(sents):
        return vectorizer.transform(sents).dot(projection_mat)

    return vectorize_sents


@lru_cache()
@mem.cache
def cached_scores_by_cluster_argsort(
    dataset_name, n_clusters, n_words=5, likelihood_bias_weight=0.85
):
    scores_by_cluster, unique_starts = cached_scores_by_cluster(
        dataset_name, n_clusters=n_clusters, n_words=n_words
    )

    likelihood_bias = logsumexp(scores_by_cluster, axis=0, keepdims=True)
    biased_scores_by_cluster = (
        scores_by_cluster - likelihood_bias_weight * likelihood_bias
    )
    return np.argsort(biased_scores_by_cluster, axis=1)[:, ::-1], unique_starts
