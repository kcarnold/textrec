import logging
import re
from functools import lru_cache

import joblib
import nltk
import numpy as np
import pandas as pd
import wordfreq
from gensim.models import Word2Vec
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


def tokenize_with_ner(text):
    from . import automated_analyses

    doc = automated_analyses.nlp(text)
    toks = [tok.text for tok in doc]
    raw_sents = []
    tokenized_sents = []
    for sent in doc.sents:
        for ent in sent.ents:
            if ent.label_ in {
                "EVENT",
                "GPE",
                "TIME",
                "ORDINAL",
                "CARDINAL",
                "FAC",
                "NORP",
            }:
                label = ent.root.text
            else:
                label = ent.label_
            toks[ent.start] = label
            for i in range(ent.start + 1, ent.end):
                toks[i] = None
        raw_sents.append(sent.text)
        tokenized_sents.append(
            " ".join(tok for tok in toks[sent.start : sent.end] if tok is not None)
        )
    return raw_sents, tokenized_sents


def preprocess_texts(texts):
    space_re = re.compile("\\s+")
    all_raw_sents = []
    all_tokenized_sents = []
    num_sents = []
    for text in tqdm(texts, desc="Tokenizing"):
        raw, tok = tokenize_with_ner(space_re.sub(" ", text))
        all_raw_sents.append("\0".join(raw))
        all_tokenized_sents.append("\0".join(tok))
        num_sents.append(len(raw))
    return all_raw_sents, all_tokenized_sents, num_sents


def preprocess_df(df):
    sentences, tokenized, num_sents = preprocess_texts(df.text)
    df["sentences"] = sentences
    df["tokenized"] = tokenized
    df["num_sents"] = num_sents
    return df


data_loaders = {
    "yelp": datasets.load_yelp,
    "bios": datasets.load_bios,
    "imdb": datasets.load_imdb,
    "newsroom": datasets.load_newsroom,
    "wikivoyage": datasets.load_wikivoyage,
    "wiki-book": datasets.get_wikipedia_category_loader("book"),
    "wiki-film": datasets.get_wikipedia_category_loader("film"),
    "wiki-musician": datasets.get_wikipedia_category_loader("musical artistt"),
    "wiki-television": datasets.get_wikipedia_category_loader("television"),
}


@mem.cache
def cached_full_dataset(dataset_name):
    if dataset_name not in data_loaders:
        raise NameError("Unknown dataset " + dataset_name)
    return preprocess_df(data_loaders[dataset_name]())


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
    if subset != "all":
        subsets = train_test_split(data)
        data = subsets[subset]
    return data


@lru_cache()
@mem.cache
def cached_sentences(
    dataset_name,
    min_sentences_per_doc=5,
    max_sentences_per_doc=50,
    max_sentences_total=1_250_000,
    random_state=0,
):
    """Split sentences."""
    df_full = cached_dataset(dataset_name)
    df_full = df_full.sample(frac=1, random_state=random_state)
    sentences = []
    total_num_docs = 0
    dupes = 0
    seen_texts = set()
    for row in df_full.itertuples():
        doc_id = row.doc_id
        untokenized_sents = row.sentences.split("\0")
        sents = row.tokenized.split("\0")
        assert len(untokenized_sents) == len(sents)
        doc_n_sents = len(sents)
        if doc_n_sents < min_sentences_per_doc:
            continue
        total_num_docs += 1
        for sent_idx, (raw_sent, sent) in enumerate(zip(untokenized_sents, sents)):
            if sent_idx == max_sentences_per_doc:
                break
            if raw_sent.lower() in seen_texts:
                dupes += 1
            else:
                seen_texts.add(raw_sent.lower())
                sentences.append((doc_id, doc_n_sents, sent_idx, raw_sent, sent))
        if len(sentences) >= max_sentences_total:
            break

    total_possible_sents = df_full.num_sents.sum()
    print(f"Using {total_num_docs:,} out of {len(df_full):,} docs")
    print(f"Using {len(sentences):,} out of {total_possible_sents:,} possible sents")
    print(f"{dupes:,} dupe sents")
    sentences = pd.DataFrame(
        sentences, columns="doc_id doc_n_sents sent_idx raw_sent sent".split()
    )
    return sentences, dict(total_num_docs=total_num_docs, n_dupes=dupes)


@mem.cache
def cached_vectorized_dataset(dataset_name, normalize_by_wordfreq=True):
    all_sentences, sentences_meta = cached_sentences(dataset_name)
    print("{:,} sentences".format(len(all_sentences)))

    # Filter 1: length
    all_sentences["sent_length"] = [len(sent.split()) for sent in all_sentences.sent]

    min_percentile = 25
    max_percentile = 75
    min_sent_len, max_sent_len = np.percentile(
        all_sentences.sent_length, [min_percentile, max_percentile]
    )
    length_filtered = VecPile(
        sentences=all_sentences[
            all_sentences.sent_length.between(min_sent_len, max_sent_len)
        ].copy()
    )
    print("{:,} length-filtered sentences".format(len(length_filtered)))

    # Project into word-vector space
    vectorizer = TfidfVectorizer(min_df=5, max_df=0.5, stop_words="english")
    length_filtered.raw_vecs = vectorizer.fit_transform(length_filtered.sentences.sent)

    vocab = vectorizer.get_feature_names()
    projection_mat = numberbatch_vecs.get_projection_mat(
        vocab, normalize_by_wordfreq=normalize_by_wordfreq
    )

    length_filtered.projected_vecs = length_filtered.raw_vecs.dot(projection_mat)

    # Filter out sentences that have no data in the vector space.
    # Sentences may not if they have only words that are unknown.
    row_norms = np.linalg.norm(length_filtered.projected_vecs, axis=1)
    has_sufficient_norm = np.flatnonzero(row_norms > 1e-6)

    norm_filtered = VecPile(
        sentences=length_filtered.sentences.iloc[has_sufficient_norm].copy(),
        projected_vecs=length_filtered.projected_vecs[has_sufficient_norm],
    )

    return dict(
        length_filtered=length_filtered,
        norm_filtered=norm_filtered,
        vectorizer=vectorizer,
        projection_mat=projection_mat,
        sentences_meta=sentences_meta,
    )


@lru_cache()
@mem.cache
def cached_topic_data(
    dataset_name, n_clusters, random_state=0, min_pervasiveness_frac=0.01
):
    vectorized = cached_vectorized_dataset(dataset_name)
    norm_filtered = vectorized["norm_filtered"]
    total_num_docs = vectorized["sentences_meta"]["total_num_docs"]
    min_pervasiveness = min_pervasiveness_frac * total_num_docs
    topic_data = compute_topic_data(
        norm_filtered=norm_filtered,
        n_clusters=n_clusters,
        random_state=random_state,
        min_pervasiveness=min_pervasiveness,
    )
    return dict(
        topic_data,
        vectorizer=vectorized["vectorizer"],
        projection_mat=vectorized["projection_mat"],
        total_num_docs=total_num_docs,
    )


def compute_topic_data(*, norm_filtered, n_clusters, random_state=0, min_pervasiveness):

    # Cluster
    clusterer = MiniBatchKMeans(
        init="k-means++", n_clusters=n_clusters, n_init=10, random_state=random_state
    )
    clusterer.fit(norm_filtered.projected_vecs)
    norm_filtered.dists_to_centers = clusterer.transform(norm_filtered.projected_vecs)

    # Hard-assign topics, filter to those close enough.

    nf_sentences = norm_filtered.sentences
    nf_sentences["topic"] = np.argmin(norm_filtered.dists_to_centers, axis=1)
    norm_filtered.dist_to_closest_cluster = np.min(
        norm_filtered.dists_to_centers, axis=1
    )
    norm_filtered.is_close = norm_filtered.dist_to_closest_cluster < np.median(
        norm_filtered.dist_to_closest_cluster
    )

    # distance_filtered = VecPile(
    #     indices=np.flatnonzero(norm_filtered.is_close),
    #     sentences=norm_filtered.sentences.iloc[norm_filtered.is_close].copy(),
    #     projected_vecs=norm_filtered.projected_vecs[norm_filtered.is_close],
    # )
    # print("{:,} close enough to cluster center".format(len(distance_filtered)))

    # distance_filtered.raw_vecs = norm_filtered.raw_vecs[distance_filtered.indices]

    # For each topic, how many different docs does it occur in?
    pervasiveness_by_topic = (
        nf_sentences[["doc_id", "topic"]].drop_duplicates().groupby("topic").size()
    )

    clusters_to_keep = np.flatnonzero(pervasiveness_by_topic > min_pervasiveness)

    n_clusters = len(clusters_to_keep)

    print(
        n_clusters,
        "of",
        len(pervasiveness_by_topic),
        "clusters are sufficiently pervasive",
    )

    # Re-label topics in sentences.
    cluster_old2new = {old_idx: idx for idx, old_idx in enumerate(clusters_to_keep)}
    nf_sentences["topic"] = nf_sentences.topic.map(cluster_old2new)

    sentences_to_keep = np.flatnonzero(~nf_sentences.topic.isna())

    topic_filtered = VecPile(
        sentences=nf_sentences.iloc[sentences_to_keep].copy(),
        projected_vecs=norm_filtered.projected_vecs[sentences_to_keep],
        dists_to_centers=norm_filtered.dists_to_centers[sentences_to_keep][
            :, clusters_to_keep
        ],
    )
    assert not np.any(topic_filtered.sentences.topic.isna())
    # Grr, "map" above upcasted 'topic' to float.
    topic_filtered.sentences["topic"] = topic_filtered.sentences.topic.astype(int)

    # Update topic pervasiveness to filtered topics.
    pervasiveness_by_topic = (
        topic_filtered.sentences[["doc_id", "topic"]]
        .drop_duplicates()
        .groupby("topic")
        .size()
    )

    overall_topic_distribution = (
        pervasiveness_by_topic.values / pervasiveness_by_topic.sum()
    )

    return dict(
        vars(topic_filtered),
        clusterer=subset_mbkmeans(clusterer, clusters_to_keep),
        overall_topic_distribution=overall_topic_distribution,
        pervasiveness_by_topic=pervasiveness_by_topic,
    )


def subset_mbkmeans(clusterer, clusters_to_keep):
    import copy

    clusterer = copy.copy(clusterer)
    clusterer.cluster_centers_ = clusterer.cluster_centers_[clusters_to_keep]
    del clusterer.labels_
    del clusterer.counts_
    clusterer.n_clusters = len(clusters_to_keep)
    return clusterer


def normalized_bincount(x, minlength):
    result = np.bincount(x, minlength=minlength).astype(float)
    result /= result.sum()
    return result


def get_labels_for_clusters(vectorizer, cluster_centers, sentences):
    from sklearn.metrics.pairwise import pairwise_distances
    from textrec.numberbatch_vecs import get_cnnb
    from textrec import automated_analyses

    cnnb = get_cnnb()
    vocab = vectorizer.get_feature_names()
    vocab_in_cnnb = [term for term in vocab if term in cnnb]

    # Note that we're *NOT* dividing by word frequency here.

    cnnb_mat = np.array([cnnb[term] for term in vocab_in_cnnb])

    word_vec_dists_to_centers = pairwise_distances(
        cluster_centers, cnnb_mat, metric="cosine"
    )

    BAD_WORDS = {
        "ve",
        "ll",
        "doesn",
        "isn",
        "does",
        "wouldn",
        "aren",
        "wasn",
        "shouldn",
        "didn",
        "hasn",
        "hadn",
        "couldn",
        "dont",
    }

    def pick_labels(word_vec_dists):
        used_lemmas = []
        used_words = []
        for idx in np.argsort(word_vec_dists):
            word = vocab_in_cnnb[idx]
            if word in BAD_WORDS:
                continue
            tok = automated_analyses.nlp(word)[0]
            lemma = tok.lemma_
            if lemma in used_lemmas:
                continue
            used_lemmas.append(lemma)
            used_words.append(word)
            if len(used_lemmas) == 3:
                break
        return used_words

    return [pick_labels(dists) for dists in word_vec_dists_to_centers]


def get_representative_sents(
    cluster_centers, projected_vecs, sentences, labels, num_examples_to_collect=20
):
    from sklearn.metrics import pairwise

    pdists = pairwise.pairwise_distances(
        cluster_centers, projected_vecs, metric="cosine"
    )

    by_distance_to_center = np.argsort(pdists, axis=1)

    labels_and_sents = {}
    for topic_idx, label_words in enumerate(labels):
        label_re = re.compile(
            "\\b" + "|".join(re.escape(label) for label in label_words) + "\\b",
            re.IGNORECASE,
        )

        candidates = []
        for idx in by_distance_to_center[topic_idx]:
            sent = sentences.raw_sent.iloc[idx]
            match = label_re.search(sent)
            if match:
                candidates.append((sent, match.span()))
            if len(candidates) == num_examples_to_collect:
                break
        if len(candidates) > 2:
            labels_and_sents[topic_idx] = (label_words, candidates)
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


@lru_cache()
@mem.cache
def cached_lms_per_cluster(dataset_name, n_clusters, min_pervasiveness_frac=0.01):
    # Get data.
    topic_data = cached_topic_data(
        dataset_name, n_clusters=n_clusters, min_pervasiveness_frac=0.01
    )
    clusterer = topic_data["clusterer"]
    texts = topic_data["sentences"].sent
    projected_vecs = topic_data["projected_vecs"]

    # Group sentences by cluster.
    sentences_in_cluster = [[] for i in range(clusterer.n_clusters)]
    for text, cluster_idx in zip(texts, clusterer.predict(projected_vecs)):
        sentences_in_cluster[cluster_idx].append(text)

    clusters_to_use = list(range(clusterer.n_clusters))

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


def topic_seq_model_name(dataset_name, n_clusters):
    return f"{dataset_name}_{n_clusters}_topic_seq"


@lru_cache()
@mem.cache
def cached_topic_sequence_lm(dataset_name, n_clusters=75):
    # TODO: should we use UNK or something for a rare topic?
    df_full = cached_dataset(dataset_name)
    topic_data = cached_topic_data(dataset_name, n_clusters=n_clusters)
    vectorizer = topic_data["vectorizer"]
    projection_mat = topic_data["projection_mat"]
    clusterer = topic_data["clusterer"]

    def label_topics(tokenized_doc):
        sents = tokenized_doc.split("\n")
        vecs = vectorizer.transform(sents)
        projected = vecs.dot(projection_mat)
        clusters = clusterer.predict(projected)
        return " ".join(str(cluster) for cluster in clusters)

    topic_sequences = [label_topics(tokenized) for tokenized in tqdm(df_full.tokenized)]
    model_name = topic_seq_model_name(dataset_name, n_clusters=n_clusters)
    dump_kenlm(model_name, topic_sequences, order=6, discount_fallback=True)
    return lang_model.Model.get_or_load_model(model_name)


def get_topic_sequences(sentences):
    last_doc = None
    seqs = []
    cur_seq = None
    for doc_id, topic in zip(sentences.doc_id, sentences.topic):
        if doc_id != last_doc:
            cur_seq = []
            seqs.append(cur_seq)
            last_doc = doc_id
        cur_seq.append(topic)
    return seqs


def train_topic_w2v(sentences, embedding_size, seed=1):
    topic_seqs = get_topic_sequences(sentences)
    topic_seq_strs = [[str(idx) for idx in seq] for seq in topic_seqs if len(seq) >= 2]
    return Word2Vec(
        topic_seq_strs, size=embedding_size, window=50, min_count=1, seed=seed
    )


def predict_missing_topics_w2v(
    model, existing_clusters, n_clusters, overall_topic_distribution
):
    if len(existing_clusters) == 0:
        return overall_topic_distribution.copy()
    raw_cluster_probs = model.predict_output_word(
        [str(idx) for idx in existing_clusters], topn=2000
    )
    assert n_clusters == len(overall_topic_distribution)
    cluster_probs = np.zeros(n_clusters)
    for cluster_str, prob in raw_cluster_probs:
        cluster_probs[int(cluster_str)] = prob
    assert 0.999 < cluster_probs.sum() < 1.001
    return cluster_probs


def model_filename(model_name, part):
    return paths.models / f"cue_{model_name}_{part}.joblib"


@lru_cache(maxsize=None)
def get_model(model_name, part):
    return joblib.load(model_filename(model_name, part))


def preload_models(model_names, parts):
    for name in model_names:
        for part in parts:
            get_model(name, part)
