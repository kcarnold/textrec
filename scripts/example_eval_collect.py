# Evaluating Example Sets

import json
from functools import lru_cache

import nltk
import numpy as np
import tqdm
from sklearn import preprocessing
from sklearn.model_selection import ParameterGrid
from sklearn.utils import check_random_state

from textrec import cueing


def collect_relevance_dataset(n_samples, validation_docs):
    rs = np.random.RandomState(0)
    relevance_data = []
    for i in tqdm.trange(n_samples, desc="Collect relevance dataset", mininterval=1.0):
        text = validation_docs.text.sample(n=1, random_state=rs).item()
        sents = nltk.sent_tokenize(text)
        if len(sents) == 0:
            continue

        relevance_data.append(sents)
    return relevance_data


def get_precision(
    *,
    sent_clusters,
    w2v_model,
    n_clusters,
    n_context,
    overall_topic_distribution,
    random_state: np.random.RandomState,
):
    n_sents = len(sent_clusters)
    all_indices = np.arange(n_sents)
    if n_context < 0:
        n_context = n_sents + n_context

    visible_sentences_indices = random_state.choice(
        n_sents, size=n_context, replace=False
    )
    invisible_sentence_indices = np.setdiff1d(all_indices, visible_sentences_indices)
    assert len(visible_sentences_indices) + len(invisible_sentence_indices) == n_sents

    predicted_probs = cueing.predict_missing_topics_w2v(
        w2v_model,
        sent_clusters[visible_sentences_indices],
        n_clusters,
        overall_topic_distribution,
    )

    most_likely_topics = np.argsort(predicted_probs)[::-1]
    already_covered_topics = {sent_clusters[ctx] for ctx in visible_sentences_indices}
    predicted_novel_topics = [
        topic for topic in most_likely_topics if topic not in already_covered_topics
    ]
    actual_topics = set(sent_clusters[invisible_sentence_indices])

    hits = [topic in actual_topics for topic in predicted_novel_topics]
    precision_at_5 = sum(hits[:5])
    return precision_at_5


@lru_cache(maxsize=10)
def get_vectorized_dataset(
    *, dataset_name, normalize_by_wordfreq, normalize_projected_vecs
):
    vectorized = cueing.cached_vectorized_dataset(
        dataset_name, normalize_by_wordfreq=normalize_by_wordfreq
    )

    if normalize_projected_vecs:
        vectorized["norm_filtered"].projected_vecs = preprocessing.normalize(
            vectorized["norm_filtered"].projected_vecs
        )

    return vectorized


def collect_eval_data(
    *,
    model_basename,
    random_state=0,
    n_relevance_samples,
    n_clusters_,
    n_w2v_samples=5,
    w2v_embedding_size=50,
    min_pervasiveness_frac=0.01,
):
    random_state = check_random_state(random_state)

    clustering_param_grid = {
        "n_clusters": n_clusters_,
        "normalize_by_wordfreq": [True, False],
        "normalize_projected_vecs": [True, False],
    }

    train_dataset_name = model_basename + ":train"
    valid_dataset_name = model_basename + ":valid"

    valid_dataset = cueing.cached_dataset(valid_dataset_name)

    relevance_data = collect_relevance_dataset(
        n_samples=n_relevance_samples, validation_docs=valid_dataset
    )

    results = []

    for clustering_params in tqdm.tqdm(
        ParameterGrid(clustering_param_grid), desc="Clustering options"
    ):
        n_clusters = clustering_params["n_clusters"]
        vectorized = get_vectorized_dataset(
            dataset_name=train_dataset_name,
            normalize_by_wordfreq=clustering_params["normalize_by_wordfreq"],
            normalize_projected_vecs=clustering_params["normalize_projected_vecs"],
        )

        norm_filtered = vectorized["norm_filtered"]
        vectorizer = vectorized["vectorizer"]
        projection_mat = vectorized["projection_mat"]

        total_num_docs = vectorized["sentences_meta"]["total_num_docs"]
        min_pervasiveness = min_pervasiveness_frac * total_num_docs
        topic_data = cueing.compute_topic_data(
            norm_filtered=norm_filtered,
            n_clusters=n_clusters,
            random_state=random_state,
            min_pervasiveness=min_pervasiveness,
        )
        overall_topic_distribution = topic_data["overall_topic_distribution"]
        clusterer = topic_data["clusterer"]

        def texts_to_clusters(texts):
            if len(texts) == 0:
                return np.array([], dtype=np.int32)
            return clusterer.predict(vectorizer.transform(texts).dot(projection_mat))

        context_existing_clusters = [
            texts_to_clusters(context) for context in relevance_data
        ]

        for w2v_seed in tqdm.trange(n_w2v_samples, desc="w2v samples"):
            w2v_model = cueing.train_topic_w2v(
                topic_data["sentences"],
                embedding_size=w2v_embedding_size,
                seed=w2v_seed,
            )

            for n_context in [0, 1, -1]:
                precisions = [
                    get_precision(
                        sent_clusters=sent_clusters,
                        w2v_model=w2v_model,
                        n_clusters=n_clusters,
                        n_context=n_context,
                        overall_topic_distribution=overall_topic_distribution,
                        random_state=random_state,
                    )
                    for sent_clusters in context_existing_clusters
                ]

                results.append(
                    dict(
                        **clustering_params,
                        w2v_seed=w2v_seed,
                        n_context=n_context,
                        mean_precision=np.mean(precisions),
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
