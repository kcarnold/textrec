import numpy as np
import pandas as pd
from sklearn.feature_extraction.text import TfidfVectorizer

from textrec import cueing, numberbatch_vecs
from textrec.util import dump_kenlm, VecPile
import tqdm


def flag_best_reviews(df_full):
    # Find the "best" reviews.
    df_full["total_votes"] = (
        df_full["votes_cool"] + df_full["votes_funny"] + df_full["votes_useful"]
    )
    df_full["total_votes_rank"] = df_full.groupby("business_id").total_votes.rank(
        ascending=False
    )

    business_review_counts = df_full.groupby("business_id").review_count.mean()
    median_review_count = np.median(business_review_counts)

    df_full["is_best"] = (
        (df_full.review_count >= median_review_count)
        & (df_full.total_votes >= 10)
        & (df_full.total_votes_rank <= 5)
    )


def get_topic_sequence():
    # Load dataset
    df_full = cueing.cached_dataset("yelp")

    # flag_best_reviews(df_full)

    # Split sentences.
    sentences = []
    for row in df_full.itertuples():
        doc_id = row.review_id
        sents = row.tokenized.split("\n")
        doc_n_sents = len(sents)
        for sent_idx, sent in enumerate(sents):
            sentences.append((doc_id, doc_n_sents, sent_idx, sent))

    sentences_df = pd.DataFrame(
        sentences, columns="doc_id doc_n_sents sent_idx sent".split()
    )
    del sentences
    print("{:,} sentences".format(len(sentences_df)))

    # Filter 1: length
    sentences_df["sent_length"] = [len(sent.split()) for sent in sentences_df.sent]

    # %%
    min_percentile = 25
    max_percentile = 75
    min_sent_len, max_sent_len = np.percentile(
        sentences_df.sent_length, [min_percentile, max_percentile]
    )
    length_filtered = VecPile(
        sentences=sentences_df[
            sentences_df.sent_length.between(min_sent_len, max_sent_len)
        ].copy()
    )
    print("{:,} length-filtered sentences".format(len(length_filtered)))

    # Project into vector space
    vectorizer = TfidfVectorizer(min_df=5, max_df=0.5, stop_words="english")
    length_filtered.raw_vecs = vectorizer.fit_transform(length_filtered.sentences.sent)

    vocab = vectorizer.get_feature_names()
    projection_mat = numberbatch_vecs.get_projection_mat(vocab)

    length_filtered.vecs = length_filtered.raw_vecs.dot(projection_mat)

    # Let's skip norm filtering; Note: looks like the norm filtering step didn't do much.
    norm_filtered = length_filtered

    # Cluster
    from sklearn.cluster import MiniBatchKMeans

    random_state = 0
    n_clusters = 75
    mbk_wordvecs = MiniBatchKMeans(
        init="k-means++", n_clusters=n_clusters, n_init=10, random_state=random_state
    )
    mbk_wordvecs.fit(norm_filtered.vecs)
    norm_filtered.dists_to_centers = mbk_wordvecs.transform(norm_filtered.vecs)

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
        projected_vecs=norm_filtered.vecs[norm_filtered.is_close],
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

    # TODO: Filter to include only topics that occur in more than 1% of documents.

    if False:
        # TODO: (pervasiveness_by_topic / len(df_full)).describe()

        # %%
        min_pervasiveness = 0.01 * len(df_full)
        (pervasiveness_by_topic >= min_pervasiveness).sum()

    distance_filtered.sentences = pd.merge(
        distance_filtered.sentences,
        pervasiveness_by_topic.to_frame("pervasiveness"),
        left_on="topic",
        right_index=True,
    )

    # Augment dataset with count data
    if False:
        with_n_topics = pd.merge(
            df_full,
            distance_filtered.sentences[["doc_id", "topic"]]
            .drop_duplicates()
            .groupby("doc_id")
            .size()
            .to_frame("n_topics"),
            left_on="review_id",
            right_index=True,
        )
        with_n_topics = pd.merge(
            with_n_topics,
            distance_filtered.sentences.groupby("doc_id")
            .pervasiveness.min()
            .to_frame("min_pervasiveness"),
            left_on="review_id",
            right_index=True,
        )

        with_n_topics["num_words"] = [
            len(tok.split()) for tok in with_n_topics.tokenized
        ]
        with_n_topics["num_sentences"] = [
            len(tok.split("\n")) for tok in with_n_topics.tokenized
        ]
        with_n_topics["num_chars"] = with_n_topics.text.str.len()

        with_n_topics["topic_diversity"] = (
            with_n_topics["n_topics"] / with_n_topics["num_sentences"]
        )

    # Represent a document as a sequence of topics.

    def label_topics(tokenized_doc):
        sents = tokenized_doc.split("\n")
        vecs = vectorizer.transform(sents)
        projected = vecs.dot(projection_mat)
        clusters = mbk_wordvecs.predict(projected)
        return " ".join(str(cluster) for cluster in clusters)

    df_full["topic_seq"] = [
        label_topics(tokenized) for tokenized in tqdm.tqdm_notebook(df_full.tokenized)
    ]

    # %%
    dump_kenlm("topic_sequence", df_full.topic_seq, order=6, discount_fallback=True)
