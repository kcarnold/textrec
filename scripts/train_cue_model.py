import joblib

from textrec.cueing import (
    cached_topic_data,
    train_topic_w2v,
    get_labels_for_clusters,
    get_representative_sents,
    model_filename,
)

if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser()
    parser.add_argument("dataset_name")
    parser.add_argument("n_clusters", type=int)
    parser.add_argument("--w2v_embedding_size", type=int, default=50)
    opts = parser.parse_args()

    dataset_name = opts.dataset_name + ":train"
    model = cached_topic_data(dataset_name, opts.n_clusters)

    # Add stuff.
    print("Pick labels")
    model["labels"] = get_labels_for_clusters(
        vectorizer=model["vectorizer"],
        cluster_centers=model["clusterer"].cluster_centers_,
        sentences=model["sentences"],
    )

    print("Find labeled sentences")
    model["labels_and_sents"] = get_representative_sents(
        cluster_centers=model["clusterer"].cluster_centers_,
        projected_vecs=model["projected_vecs"],
        sentences=model["sentences"],
        labels=model["labels"],
    )

    print("Train w2v")
    model["topic_w2v"] = train_topic_w2v(model["sentences"], opts.w2v_embedding_size)

    for k, v in model.items():
        filename = model_filename(f"{opts.dataset_name}_{opts.n_clusters}", k)
        joblib.dump(v, filename)
