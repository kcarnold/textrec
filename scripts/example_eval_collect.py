# Evaluating Example Sets

import json

import nltk
import numpy as np
import tqdm
from sklearn import preprocessing
from sklearn.cluster import MiniBatchKMeans
from sklearn.metrics import roc_auc_score
from sklearn.model_selection import ParameterGrid

from icecream import ic
from textrec import cueing


def collect_relevance_dataset(n_samples, validation_docs, validation_sents):
    rs = np.random.RandomState(0)
    relevance_data = []
    for i in tqdm.trange(n_samples, desc="Collect relevance dataset"):
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


def get_scores_w2v(
    *,
    model,
    novel_only=False,
    context_existing_clusters,
    target_clusters,
    random_clusters,
):
    y_true = []
    y_score = []
    for i in range(len(context_existing_clusters)):
        existing_clusters = context_existing_clusters[i]
        target_cluster = target_clusters[i]
        if len(existing_clusters) == 0:
            # w2v gets to cheat and not predict here.
            continue
        if novel_only and target_cluster in existing_clusters:
            continue
        cluster_probs = model.predict_output_word(
            [str(idx) for idx in existing_clusters], topn=2000
        )
        cluster_probs = dict(cluster_probs)
        assert 0.999 < sum(cluster_probs.values()) < 1.001

        for true_label, clust in enumerate([random_clusters[i], target_clusters[i]]):
            y_true.append(true_label)
            y_score.append(cluster_probs[str(clust)])

    return np.array(y_true), np.array(y_score)


def collect_eval_data(
    model_basename,
    random_state=0,
    n_relevance_samples=1000,
    n_clusters_=[50, 128, 250],
    n_w2v_samples=5,
    w2v_embedding_size=50,
):

    clustering_param_grid = {"n_clusters": n_clusters_, "normalize": [True, False]}

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

    vectorized = cueing.cached_vectorized_dataset(train_dataset_name)
    length_filtered = vectorized["length_filtered"]
    vectorizer = vectorized["vectorizer"]
    projection_mat = vectorized["projection_mat"]

    projected_vecs_unnorm = length_filtered.projected_vecs
    projected_vecs_norm = preprocessing.normalize(projected_vecs_unnorm)

    for clustering_params in ParameterGrid(clustering_param_grid):
        ic(clustering_params)

        n_clusters = clustering_params["n_clusters"]
        if clustering_params["normalize"]:
            projected_vecs = projected_vecs_norm
        else:
            projected_vecs = projected_vecs_unnorm

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
        training_topic_labeled_sents = length_filtered.sentences
        training_topic_labeled_sents["topic"] = np.argmin(dists_to_centers, axis=1)

        def texts_to_clusters(texts):
            if len(texts) == 0:
                return np.array([], dtype=np.int32)
            return clusterer.predict(vectorizer.transform(texts).dot(projection_mat))

        context_existing_clusters = [
            texts_to_clusters(context)
            for context, target_sent, random_sent in tqdm.tqdm(
                relevance_data, desc="Getting clusters for contexts"
            )
        ]

        target_clusters = texts_to_clusters(
            [target_sent for context, target_sent, random_sent in relevance_data]
        )
        random_clusters = texts_to_clusters(
            [random_sent for context, target_sent, random_sent in relevance_data]
        )

        for w2v_seed in range(n_w2v_samples):
            ic("Train w2v")
            w2v_model = cueing.train_topic_w2v(
                training_topic_labeled_sents,
                embedding_size=w2v_embedding_size,
                seed=w2v_seed,
            )

            for novel_only in [False, True]:
                ic("Score w2v")
                y_true, y_score = get_scores_w2v(
                    model=w2v_model,
                    novel_only=novel_only,
                    context_existing_clusters=context_existing_clusters,
                    target_clusters=target_clusters,
                    random_clusters=random_clusters,
                )

                relevance_auc = roc_auc_score(y_true, y_score)
                results.append(
                    dict(
                        **clustering_params,
                        novel_only=novel_only,
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
    parser.add_argument("n_relevance_samples", type=int, default=1000)
    parser.add_argument("--w2v_embedding_size", type=int, default=50)
    parser.add_argument("--output", type=str, default="relevance_eval_results.json")
    opts = parser.parse_args()

    n_clusters_ = [int(x) for x in opts.n_clusters.split(",")]

    results = collect_eval_data(
        model_basename=opts.dataset_name,
        random_state=0,
        n_relevance_samples=opts.n_relevance_samples,
        n_clusters_=n_clusters_,
        n_w2v_samples=5,
        w2v_embedding_size=opts.w2v_embedding_size,
    )

    with open(opts.output, "w") as f:
        json.dump(results, f)
