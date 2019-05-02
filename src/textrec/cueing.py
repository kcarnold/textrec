import logging
import pickle
from functools import lru_cache

import numpy as np
import pandas as pd
from tqdm import tqdm
from scipy.special import logsumexp
from sklearn.cluster import MiniBatchKMeans
from sklearn.feature_extraction.text import TfidfVectorizer

from . import lang_model, numberbatch_vecs
from .paths import paths
from .util import VecPile, dump_kenlm, mem, tokenize

logger = logging.getLogger(__name__)


def summarize_clusters(doc_texts, cluster_dists):
    for c in range(cluster_dists.shape[1]):
        print(c)
        for i in np.argsort(cluster_dists[:, c])[:10]:
            print(i, doc_texts[i].replace("\n", " "))
        print()


def normalize_dists(dists):
    return dists / np.sum(dists, axis=1, keepdims=True)


@lru_cache()
def load_yelp():
    with open(paths.top_level / "preproc/yelp/train_data.pkl", "rb") as f:
        df = pickle.load(f)["data"]

    # Some edits...
    df = df.rename(columns={"review_id": "doc_id"})
    # Temporary hack.
    df["sentences"] = df["tokenized"]
    return df


@lru_cache()
@mem.cache
def load_bios():
    import wordfreq
    import nltk

    with open("/Data/biosbias/BIOS.pkl", "rb") as f:
        bios = pickle.load(f)
    print(f"Loaded {len(bios)} bios")

    texts = [bio["raw"] for bio in bios]
    sentences = [
        nltk.sent_tokenize(text) for text in tqdm(texts, desc="Splitting sentences")
    ]
    tokenized = [
        "\n".join(
            " ".join(wordfreq.tokenize(sent, "en", include_punctuation=True))
            for sent in sents
        )
        for sents in tqdm(sentences, desc="Tokenizing bios")
    ]
    return (
        pd.DataFrame(
            dict(
                text=texts,
                sentences=["\n".join(sents) for sents in sentences],
                tokenized=tokenized,
            )
        )
        .rename_axis(index="doc_id")
        .reset_index()
    )


data_loaders = {"yelp": load_yelp, "bios": load_bios}


def cached_dataset(dataset_name):
    """Datasets have the following form:

    - doc_id
    - text: raw text
    - sentences: raw text split to sentences joined by newlines
    - tokenized: space-separated tokens for each sentence; sentences joined by newlines

    They may also have other columns of metadata.
    """
    if dataset_name in data_loaders:
        return data_loaders[dataset_name]()
    raise NameError("Unknown dataset " + dataset_name)


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

    # Let's skip norm filtering, since it didn't do much.
    norm_filtered = length_filtered

    # Cluster
    random_state = 0
    clusterer = MiniBatchKMeans(
        init="k-means++", n_clusters=n_clusters, n_init=10, random_state=random_state
    )
    clusterer.fit(norm_filtered.projected_vecs)
    norm_filtered.dists_to_centers = clusterer.transform(norm_filtered.projected_vecs)

    # Hard-assign topics, filter to those close enough.

    norm_filtered.sentences["topic"] = np.argmin(norm_filtered.dists_to_centers, axis=1)
    norm_filtered.dist_to_closest_cluster = np.min(
        norm_filtered.dists_to_centers, axis=1
    )
    norm_filtered.is_close = norm_filtered.dist_to_closest_cluster < np.median(
        norm_filtered.dist_to_closest_cluster
    )

    distance_filtered = VecPile(
        indices=np.flatnonzero(norm_filtered.is_close),
        sentences=norm_filtered.sentences.iloc[norm_filtered.is_close].copy(),
        projected_vecs=norm_filtered.projected_vecs[norm_filtered.is_close],
    )
    print("{:,} close enough to cluster center".format(len(distance_filtered)))

    distance_filtered.raw_vecs = norm_filtered.raw_vecs[distance_filtered.indices]

    # For each topic, how many different docs does it occur in?
    pervasiveness_by_topic = (
        distance_filtered.sentences[["doc_id", "topic"]]
        .drop_duplicates()
        .groupby("topic")
        .size()
    )

    return dict(
        vars(norm_filtered),
        vectorizer=vectorizer,
        projection_mat=projection_mat,
        clusterer=clusterer,
        pervasiveness_by_topic=pervasiveness_by_topic,
        total_num_docs=len(df_full),
    )


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


#         params['omit_unks'] = np.flatnonzero([
#             [any(model.model.vocab_index(tok) == 0 for tok in toks) for model in models]
#             for toks in unique_starts])


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
