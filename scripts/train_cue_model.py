import joblib

from textrec.cueing import (
    cached_topic_data,
    get_cooccurrence_mat,
    get_labels_for_clusters,
    model_filename,
)

if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser()
    parser.add_argument("dataset_name")
    parser.add_argument("n_clusters", type=int)
    opts = parser.parse_args()

    dataset_name = opts.dataset_name + ":train"
    model = cached_topic_data(dataset_name, opts.n_clusters)

    # Add stuff.
    model["labels_and_sents"] = get_labels_for_clusters(
        vectorizer=model["vectorizer"],
        cluster_centers=model["clusterer"].cluster_centers_,
        sentences=model["sentences"],
    )

    model["cooccur"] = get_cooccurrence_mat(
        model["sentences"], n_clusters=model["clusterer"].n_clusters
    )

    for k, v in model.items():
        filename = model_filename(f"{opts.dataset_name}_{opts.n_clusters}", k)
        joblib.dump(v, filename)
