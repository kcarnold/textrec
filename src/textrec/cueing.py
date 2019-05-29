import logging
import re
from functools import lru_cache

import joblib
import nltk
import numpy as np
import pandas as pd
import wordfreq
from scipy.special import logsumexp
from sklearn.cluster import MiniBatchKMeans
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.utils import check_random_state
from tqdm import tqdm

from . import datasets, lang_model, numberbatch_vecs
from .paths import paths
from .util import VecPile, dump_kenlm, mem

logger = logging.getLogger(__name__)


def summarize_clusters(doc_texts, cluster_dists):
    for c in range(cluster_dists.shape[1]):
        print(c)
        for i in np.argsort(cluster_dists[:, c])[:10]:
            print(i, doc_texts[i].replace("\n", " "))
        print()


def normalize_dists(dists):
    return dists / np.sum(dists, axis=1, keepdims=True)


def preprocess_texts(texts):
    space_re = re.compile("\\s+")

    sentences = [
        nltk.sent_tokenize(space_re.sub(" ", text))
        for text in tqdm(texts, desc="Splitting sentences")
    ]
    tokenized = [
        "\n".join(
            " ".join(wordfreq.tokenize(sent, "en", include_punctuation=True))
            for sent in sents
        )
        for sents in tqdm(sentences, desc="Tokenizing")
    ]
    return sentences, tokenized


def preprocess_df(df):
    sentences, tokenized = preprocess_texts(df.text)
    df["sentences"] = ["\n".join(sents) for sents in sentences]
    df["tokenized"] = tokenized
    return df


data_loaders = {
    "yelp": datasets.load_yelp,
    "bios": datasets.load_bios,
    "imdb": datasets.load_imdb,
    "newsroom": datasets.load_newsroom,
    "wikivoyage": datasets.load_wikivoyage,
}


@mem.cache
def cached_full_dataset(dataset_name):
    if dataset_name not in data_loaders:
        raise NameError("Unknown dataset " + dataset_name)
    return data_loaders[dataset_name]()


def train_test_split(data, *, valid_frac=0.05, test_frac=0.05, seed=0):
    train_frac = 1 - valid_frac - test_frac
    num_docs = len(data)
    random_state = check_random_state(seed)
    indices = random_state.permutation(num_docs)
    splits = (np.cumsum([train_frac, valid_frac]) * num_docs).astype(int)
    segment_indices = np.split(indices, splits)
    names = ["train", "valid", "test"]
    return {
        name: data.iloc[indices].reset_index(drop=True)
        for name, indices in zip(names, segment_indices)
    }


@lru_cache()
@mem.cache
def cached_dataset(dataset_name):
    """Datasets have the following form:

    - doc_id
    - text: raw text
    - sentences: raw text split to sentences joined by newlines
    - tokenized: space-separated tokens for each sentence; sentences joined by newlines

    They may also have other columns of metadata.
    """
    dataset_name, subset = dataset_name.split(":")
    data = cached_full_dataset(dataset_name)
    subsets = train_test_split(data)
    df = subsets[subset]
    return preprocess_df(df)


@lru_cache()
@mem.cache
def cached_sentences(dataset_name):
    """Split sentences."""
    df_full = cached_dataset(dataset_name)
    sentences = []
    for row in df_full.itertuples():
        doc_id = row.doc_id
        untokenized_sents = row.sentences.split("\n")
        sents = row.tokenized.split("\n")
        doc_n_sents = len(sents)
        assert len(untokenized_sents) == len(sents)
        for sent_idx, (raw_sent, sent) in enumerate(zip(untokenized_sents, sents)):
            sentences.append((doc_id, doc_n_sents, sent_idx, raw_sent, sent))

    sentences = pd.DataFrame(
        sentences, columns="doc_id doc_n_sents sent_idx raw_sent sent".split()
    )
    return sentences


@lru_cache()
@mem.cache
def cached_topic_data(dataset_name, n_clusters):
    # Load dataset
    df_full = cached_dataset(dataset_name)

    # flag_best_reviews(df_full)

    sentences = cached_sentences(dataset_name)
    print("{:,} sentences".format(len(sentences)))

    # Filter 1: length
    sentences["sent_length"] = [len(sent.split()) for sent in sentences.sent]

    min_percentile = 25
    max_percentile = 75
    min_sent_len, max_sent_len = np.percentile(
        sentences.sent_length, [min_percentile, max_percentile]
    )
    length_filtered = VecPile(
        sentences=sentences[
            sentences.sent_length.between(min_sent_len, max_sent_len)
        ].copy()
    )
    print("{:,} length-filtered sentences".format(len(length_filtered)))

    # Project into word-vector space
    vectorizer = TfidfVectorizer(min_df=5, max_df=0.5, stop_words="english")
    length_filtered.raw_vecs = vectorizer.fit_transform(length_filtered.sentences.sent)

    vocab = vectorizer.get_feature_names()
    projection_mat = numberbatch_vecs.get_projection_mat(vocab)

    length_filtered.projected_vecs = length_filtered.raw_vecs.dot(projection_mat)

    # Cluster
    random_state = 0
    clusterer = MiniBatchKMeans(
        init="k-means++", n_clusters=n_clusters, n_init=10, random_state=random_state
    )
    clusterer.fit(length_filtered.projected_vecs)
    length_filtered.dists_to_centers = clusterer.transform(
        length_filtered.projected_vecs
    )

    # Hard-assign topics, filter to those close enough.

    length_filtered.sentences["topic"] = np.argmin(
        length_filtered.dists_to_centers, axis=1
    )
    length_filtered.dist_to_closest_cluster = np.min(
        length_filtered.dists_to_centers, axis=1
    )
    length_filtered.is_close = length_filtered.dist_to_closest_cluster < np.median(
        length_filtered.dist_to_closest_cluster
    )

    distance_filtered = VecPile(
        indices=np.flatnonzero(length_filtered.is_close),
        sentences=length_filtered.sentences.iloc[length_filtered.is_close].copy(),
        projected_vecs=length_filtered.projected_vecs[length_filtered.is_close],
    )
    print("{:,} close enough to cluster center".format(len(distance_filtered)))

    distance_filtered.raw_vecs = length_filtered.raw_vecs[distance_filtered.indices]

    # For each topic, how many different docs does it occur in?
    pervasiveness_by_topic = (
        distance_filtered.sentences[["doc_id", "topic"]]
        .drop_duplicates()
        .groupby("topic")
        .size()
    )

    return dict(
        vars(length_filtered),
        vectorizer=vectorizer,
        projection_mat=projection_mat,
        clusterer=clusterer,
        pervasiveness_by_topic=pervasiveness_by_topic,
        total_num_docs=len(df_full),
    )


def get_labels_for_clusters(
    vectorizer, cluster_centers, sentences, MIN_CLUSTER_SIZE=20
):
    from sklearn.metrics.pairwise import pairwise_distances_argmin
    from textrec.numberbatch_vecs import get_cnnb
    import re

    cnnb = get_cnnb()
    vocab = vectorizer.get_feature_names()
    vocab_in_cnnb = [term for term in vocab if term in cnnb]

    # Note that we're *NOT* dividing by word frequency here.

    cnnb_mat = np.array([cnnb[term] for term in vocab_in_cnnb])

    labels = [
        vocab_in_cnnb[idx]
        for idx in pairwise_distances_argmin(cluster_centers, cnnb_mat)
    ]

    labels_and_sents = {}
    for topic_idx, label in enumerate(labels):
        label_re = re.compile("\\b" + re.escape(label) + "\\b", re.IGNORECASE)
        topic_sents = sentences
        topic_sents = topic_sents[topic_sents.topic == topic_idx].raw_sent
        candidates = []
        for sent in topic_sents:
            match = label_re.search(sent)
            if match:
                candidates.append((sent, match.span()))
        if len(candidates) > MIN_CLUSTER_SIZE:
            labels_and_sents[topic_idx] = (label, candidates)
    return labels_and_sents


def get_cooccurrence_mat(sentences, n_clusters):
    from itertools import combinations

    cooccur = np.zeros((n_clusters, n_clusters))
    for doc_id, topics in sentences.groupby("doc_id").topic:
        for a, b in combinations(topics, 2):
            cooccur[a, b] += 1
    # Make order not matter.
    cooccur = cooccur + cooccur.T
    return cooccur


MIN_SENTS_IN_CLUSTER = 50


@lru_cache()
@mem.cache
def cached_lms_per_cluster(dataset_name, n_clusters, min_pervasiveness_frac=0.01):
    # Get data.
    topic_data = cached_topic_data(dataset_name, n_clusters=n_clusters)
    clusterer = topic_data["clusterer"]
    texts = topic_data["sentences"].sent
    projected_vecs = topic_data["projected_vecs"]

    # Group sentences by cluster.
    sentences_in_cluster = [[] for i in range(clusterer.n_clusters)]
    for text, cluster_idx in zip(texts, clusterer.predict(projected_vecs)):
        sentences_in_cluster[cluster_idx].append(text)

    # Filter to include only topics that occur in more than 1% of documents.
    min_pervasiveness = min_pervasiveness_frac * topic_data["total_num_docs"]
    clusters_to_use = []
    for topic, num_documents_with_topic in topic_data[
        "pervasiveness_by_topic"
    ].iteritems():
        if (
            num_documents_with_topic >= min_pervasiveness
            and len(sentences_in_cluster) >= MIN_SENTS_IN_CLUSTER
        ):
            clusters_to_use.append(topic)

    print(f"Using {len(clusters_to_use)} out of {clusterer.n_clusters} clusters.")

    # Train models (shells out to KenLM)
    model_basename = f"{dataset_name}_{n_clusters}"

    for cluster_idx in clusters_to_use:
        print(cluster_idx)
        dump_kenlm(
            "{}_{}".format(model_basename, cluster_idx),
            [s.lower() for s in sentences_in_cluster[cluster_idx]],
        )

    # Load models
    return {
        cluster_idx: lang_model.Model.get_or_load_model(
            f"{model_basename}_{cluster_idx}"
        )
        for cluster_idx in clusters_to_use
    }


def get_unique_starts(sents, n_words):
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
    # Score the first n_words words of every sentence.
    topic_data = cached_topic_data(dataset_name, n_clusters=n_clusters)
    sents = topic_data["sentences"].sent
    unique_starts = get_unique_starts(sents, n_words=n_words)
    models = cached_lms_per_cluster(dataset_name, n_clusters)
    return dict(
        unique_starts=unique_starts,
        scores={
            cluster_idx: np.array(
                [model.score_seq(model.bos_state, k)[0] for k in unique_starts]
            )
            for cluster_idx, model in tqdm(models.items(), desc="Score by cluster")
        },
    )


@lru_cache()
@mem.cache
def cached_scores_by_cluster_argsort(
    dataset_name, n_clusters, n_words=5, likelihood_bias_weight=0.85
):
    sbc_data = cached_scores_by_cluster(
        dataset_name, n_clusters=n_clusters, n_words=n_words
    )
    cluster_indices, scores_by_cluster = zip(*sorted(sbc_data["scores"].items()))
    scores_by_cluster = np.array(list(scores_by_cluster))
    likelihood_bias = logsumexp(scores_by_cluster, axis=0, keepdims=True)
    biased_scores_by_cluster = (
        scores_by_cluster - likelihood_bias_weight * likelihood_bias
    )
    argsorts = np.argsort(biased_scores_by_cluster, axis=1)[:, ::-1]
    return dict(zip(cluster_indices, argsorts)), sbc_data["unique_starts"]


def get_topic_sequences(tokenized_docs, vectorizer, projection_mat, clusterer):
    """For each document, label the sentences in it by topic."""

    def label_topics(tokenized_doc):
        sents = tokenized_doc.split("\n")
        vecs = vectorizer.transform(sents)
        projected = vecs.dot(projection_mat)
        clusters = clusterer.predict(projected)
        return " ".join(str(cluster) for cluster in clusters)

    return [label_topics(tokenized) for tokenized in tqdm(tokenized_docs)]


def topic_seq_model_name(dataset_name, n_clusters):
    return f"{dataset_name}_{n_clusters}_topic_seq"


@lru_cache()
@mem.cache
def cached_topic_sequence_lm(dataset_name, n_clusters=75):
    # TODO: should we use UNK or something for a rare topic?
    df_full = cached_dataset(dataset_name)
    topic_data = cached_topic_data(dataset_name, n_clusters=n_clusters)
    topic_sequences = get_topic_sequences(
        df_full.tokenized,
        vectorizer=topic_data["vectorizer"],
        projection_mat=topic_data["projection_mat"],
        clusterer=topic_data["clusterer"],
    )
    model_name = topic_seq_model_name(dataset_name, n_clusters=n_clusters)
    dump_kenlm(model_name, topic_sequences, order=6, discount_fallback=True)
    return lang_model.Model.get_or_load_model(model_name)


def model_filename(model_name, part):
    return paths.models / f"cue_{model_name}_{part}.joblib"


@lru_cache(maxsize=None)
def get_model(model_name, part):
    return joblib.load(model_filename(model_name, part))


def preload_models(model_names, parts):
    for name in model_names:
        for part in parts:
            get_model(name, part)
