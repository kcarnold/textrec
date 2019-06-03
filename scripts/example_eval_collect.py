# Evaluating Example Sets

import json
from functools import lru_cache

import nltk
import numpy as np
import tqdm
from sklearn import preprocessing
from sklearn.cluster import MiniBatchKMeans
from sklearn.metrics import roc_auc_score
from sklearn.model_selection import ParameterGrid

from textrec import cueing


def collect_relevance_dataset(n_samples, validation_docs, validation_sents):
    rs = np.random.RandomState(0)
    relevance_data = []
    for i in tqdm.trange(n_samples, desc="Collect relevance dataset", mininterval=1.0):
        text = validation_docs.text.sample(n=1, random_state=rs).item()
        sents = nltk.sent_tokenize(text)
        if len(sents) == 0:
            continue

        # Pick a sentence as the true target.
        sent_idx = rs.choice(len(sents))

        # TODO: Shuffle the order, vary context length?
        context = sents[:sent_idx]
        target_sent = sents[sent_idx]
        random_sent = validation_sents.raw_sent.sample(n=1, random_state=rs).item()

        relevance_data.append((context, target_sent, random_sent))
    return relevance_data


def get_scores(
    *, context_existing_clusters, cluster_probs, target_clusters, random_clusters
):
    y_true = []
    y_score = []
    is_novels = []
    for i in range(len(context_existing_clusters)):
        existing_clusters = context_existing_clusters[i]
        target_cluster = target_clusters[i]
        probs = cluster_probs[i]

        is_novel = target_cluster not in existing_clusters

        for true_label, clust in enumerate([random_clusters[i], target_clusters[i]]):
            y_true.append(true_label)
            y_score.append(probs[clust])
            is_novels.append(is_novel)

    return np.array(y_true), np.array(y_score), np.array(is_novels)


@lru_cache(maxsize=10)
def get_vectorized_dataset(
    *, dataset_name, normalize_by_wordfreq, normalize_projected_vecs
):
    vectorized = cueing.cached_vectorized_dataset(
        dataset_name, normalize_by_wordfreq=normalize_by_wordfreq
    )
    length_filtered = vectorized["length_filtered"]
    vectorizer = vectorized["vectorizer"]
    projection_mat = vectorized["projection_mat"]
    projected_vecs = length_filtered.projected_vecs

    if normalize_projected_vecs:
        projected_vecs = preprocessing.normalize(projected_vecs)

    return length_filtered.sentences, vectorizer, projection_mat, projected_vecs


def collect_eval_data(
    *,
    model_basename,
    random_state=0,
    n_relevance_samples,
    n_clusters_,
    n_w2v_samples=5,
    w2v_embedding_size=50,
):

    clustering_param_grid = {
        "n_clusters": n_clusters_,
        "normalize_by_wordfreq": [True, False],
        "normalize_projected_vecs": [True, False],
    }

    train_dataset_name = model_basename + ":train"
    valid_dataset_name = model_basename + ":valid"

    # train_dataset = cueing.cached_dataset(train_dataset_name)
    valid_dataset = cueing.cached_dataset(valid_dataset_name)
    valid_sents = cueing.cached_sentences(valid_dataset_name)

    relevance_data = collect_relevance_dataset(
        n_samples=n_relevance_samples,
        validation_docs=valid_dataset,
        validation_sents=valid_sents,
    )

    results = []

    for clustering_params in tqdm.tqdm(
        ParameterGrid(clustering_param_grid), desc="Clustering options"
    ):
        n_clusters = clustering_params["n_clusters"]
        training_sentences, vectorizer, projection_mat, projected_vecs = get_vectorized_dataset(
            dataset_name=train_dataset_name,
            normalize_by_wordfreq=clustering_params["normalize_by_wordfreq"],
            normalize_projected_vecs=clustering_params["normalize_projected_vecs"],
        )

        # Cluster
        clusterer = MiniBatchKMeans(
            init="k-means++",
            n_clusters=n_clusters,
            n_init=10,
            random_state=random_state,
        )
        clusterer.fit(projected_vecs)
        dists_to_centers = clusterer.transform(projected_vecs)

        # Hard-assign topics, filter to those close enough.
        training_sentences["topic"] = np.argmin(dists_to_centers, axis=1)

        overall_topic_distribution = np.bincount(
            training_sentences.topic, minlength=n_clusters
        ).astype(float)
        overall_topic_distribution /= overall_topic_distribution.sum()

        topic_is_common = overall_topic_distribution > np.median(
            overall_topic_distribution
        )

        def texts_to_clusters(texts):
            if len(texts) == 0:
                return np.array([], dtype=np.int32)
            return clusterer.predict(vectorizer.transform(texts).dot(projection_mat))

        context_existing_clusters = [
            texts_to_clusters(context)
            for context, target_sent, random_sent in relevance_data
        ]

        target_clusters = texts_to_clusters(
            [target_sent for context, target_sent, random_sent in relevance_data]
        )
        random_clusters = texts_to_clusters(
            [random_sent for context, target_sent, random_sent in relevance_data]
        )

        target_is_common = topic_is_common[target_clusters].repeat(2)

        for w2v_seed in tqdm.trange(n_w2v_samples, desc="w2v samples"):
            w2v_model = cueing.train_topic_w2v(
                training_sentences, embedding_size=w2v_embedding_size, seed=w2v_seed
            )

            predicted_probs = [
                cueing.predict_missing_topics_w2v(
                    w2v_model, existing_clusters, n_clusters, overall_topic_distribution
                )
                for existing_clusters in context_existing_clusters
            ]

            y_true, y_score, is_novel = get_scores(
                context_existing_clusters=context_existing_clusters,
                cluster_probs=predicted_probs,
                target_clusters=target_clusters,
                random_clusters=random_clusters,
            )

            for eval_params in ParameterGrid(
                {
                    "novel": ["all", "novel", "repeat"],
                    "topic_frequency": ["all", "common", "rare"],
                }
            ):
                if eval_params["novel"] == "all":
                    mask = np.zeros_like(is_novel) == 0
                elif eval_params["novel"] == "novel":
                    mask = is_novel
                else:
                    assert eval_params["novel"] == "repeat"
                    mask = ~is_novel

                if eval_params["topic_frequency"] == "common":
                    mask = mask & target_is_common
                elif eval_params["topic_frequency"] == "rare":
                    mask = mask & ~target_is_common
                else:
                    assert eval_params["topic_frequency"] == "all"

                num_counted = len(np.flatnonzero(mask))
                relevance_auc = roc_auc_score(y_true[mask], y_score[mask])
                results.append(
                    dict(
                        **clustering_params,
                        **eval_params,
                        num_counted=num_counted,
                        w2v_seed=w2v_seed,
                        relevance_auc=relevance_auc,
                    )
                )

    return results


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser()
    parser.add_argument("dataset_name")
    parser.add_argument("n_clusters", type=str)
    parser.add_argument("--n_relevance_samples", type=int, default=10000)
    parser.add_argument("--w2v_embedding_size", type=int, default=50)
    parser.add_argument("--output", type=str, default="relevance_eval_results.json")
    parser.add_argument("--subset", type=str)
    opts = parser.parse_args()

    n_clusters_ = list(range(*[int(x) for x in opts.n_clusters.split(":")]))

    if opts.subset:
        batch, total = opts.subset.split("/")
        batch = int(batch)
        total = int(total)
        this_n_clusters = [x for i, x in enumerate(n_clusters_) if i % total == batch]
        n_clusters_ = this_n_clusters
        output = opts.output + f"-{batch}_of_{total}"
        print(f"{batch} / {total} : n_clusters = {n_clusters_}")
    else:
        output = opts.output

    results = collect_eval_data(
        model_basename=opts.dataset_name,
        random_state=0,
        n_relevance_samples=opts.n_relevance_samples,
        n_clusters_=n_clusters_,
        n_w2v_samples=5,
        w2v_embedding_size=opts.w2v_embedding_size,
    )

    with open(output, "w") as f:
        json.dump(results, f)
