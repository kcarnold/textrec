"""
Create annotation tasks for the data extracted in analysis_step1.
"""
import json
import pathlib
import pickle

import numpy as np

from textrec.paths import paths


def main(batch, num_texts_per_HIT, seed):
    random_state = np.random.RandomState(seed)

    batch_path: pathlib.Path = paths.data / "analyzed" / "idea" / batch
    with open(batch_path / "step1.pkl", "rb") as f:
        analyses = pickle.load(f)

    writings = (
        analyses["trial_level"]
        .loc[:, ["block", "finalText"]]
        .rename(columns={"block": "topic", "finalText": "text"})
    )

    # We should compare fixed sets of texts.
    # - Each set should have the same type of articles.
    # - Each set should include some text from Wikipedia.

    chunks = []
    for topic, writings_in_topic in writings.groupby("topic"):
        # Break the texts into groups of num_texts_per_HIT
        writings_in_topic = writings_in_topic.sample(frac=1, random_state=random_state)
        hit_assignment = np.repeat(
            np.arange(len(writings_in_topic)), num_texts_per_HIT
        )[: len(writings_in_topic)]
        for chunk_idx, chunk in writings_in_topic.groupby(hit_assignment):
            # TODO: mix in some Wikipedia texts.
            # TODO: add the titles?
            chunks.append(chunk.text.tolist())

    with open(batch_path / "annotation_chunks.json", "w") as f:
        json.dump(chunks, f)
    return dict(analyses, chunks=chunks)


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("batch")
    parser.add_argument("--num_texts_per_HIT", type=int, default=10)
    parser.add_argument("--seed", type=int, default=0)
    opts = parser.parse_args()
    globals().update(
        main(opts.batch, num_texts_per_HIT=opts.num_texts_per_HIT, seed=opts.seed)
    )
