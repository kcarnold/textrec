import numpy as np
import pandas as pd
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.cluster import MiniBatchKMeans

 
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


def other():

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

