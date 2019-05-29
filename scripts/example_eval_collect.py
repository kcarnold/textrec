# Evaluating Example Sets

import nltk
import numpy as np
import pandas as pd
import tqdm
from sklearn.metrics import roc_auc_score, roc_curve

from icecream import ic
from textrec import automated_analyses, cueing, datasets, rec_generator


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


def collect_eval_data(model_basename, random_state, n_relevance_samples=10000):
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
    w2v_embedding_size = 50
    for n_clusters in [50, 128, 250]:
        topic_data = cueing.cached_topic_data(train_dataset_name, n_clusters)

        clusterer = topic_data["clusterer"]
        projection_mat = topic_data["projection_mat"]
        vectorizer = topic_data["vectorizer"]
        training_topic_labeled_sents = topic_data["sentences"]

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

        for w2v_seed in range(5):
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
                        n_clusters=n_clusters,
                        novel_only=novel_only,
                        w2v_seed=w2v_seed,
                        relevance_auc=relevance_auc,
                    )
                )

    return results
