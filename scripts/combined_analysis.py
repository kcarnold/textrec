import pandas as pd
import numpy as np
from textrec.paths import paths


def do_all_analyses(batches):
    from textrec import logs_to_csv, gruntwork

    for batch in batches:
        print("logs_to_csv", batch)
        logs_to_csv.main(batch)
        print("gruntwork", batch)
        gruntwork.main(batch)


batches = ["gc1", "spec2", "spec1"]


def main(redo_analyses):
    if redo_analyses:
        do_all_analyses(batches)

    frames = [
        pd.read_csv(paths.analyzed / f"trial_withmanual_{exp}.csv") for exp in batches
    ]
    # Approach based on https://stackoverflow.com/a/48064892/69707
    columns_ordered = []
    for frame in frames:
        for col in frame.columns:
            if col not in columns_ordered:
                columns_ordered.append(col)
    all_data = (
        pd.concat(frames, keys=batches, names=("experiment", "_idx"), sort=False)[
            columns_ordered
        ]
        .reset_index(level=0)
        .reset_index(drop=True)
    )

    all_data["first_block_condition"] = all_data.condition_order.map(
        lambda x: x.split(",", 1)[0]
    )

    # Compute baseline speed
    norecs_speed = (
        all_data[all_data.condition == "norecs"]
        .groupby("participant")
        .characters_per_sec.mean()
    )
    with_norecs_speed = pd.merge(
        all_data,
        norecs_speed.to_frame("chars_per_sec_norecs_mean"),
        left_on="participant",
        right_index=True,
    )

    with_norecs_speed["chars_per_sec_ratio_to_norecs"] = (
        with_norecs_speed.characters_per_sec
        / with_norecs_speed.chars_per_sec_norecs_mean
    )
    with_norecs_speed["chars_per_sec_ratio_to_norecs_log"] = np.log(
        with_norecs_speed.chars_per_sec_ratio_to_norecs
    )

    # Compute POS tag counts.
    from textrec import automated_analyses

    pos_counts = [
        automated_analyses.pos_counts(text) for text in with_norecs_speed.corrected_text
    ]
    pos_counts = pd.DataFrame(pos_counts).fillna(0).astype(float)
    normed_pos_counts = pos_counts.div(pos_counts.sum(axis=1), axis=0)

    # Detect use of progressive tense
    progressive_tense = 0 + with_norecs_speed.corrected_text.str.contains(
        r"(?:is|are) \w+ing"
    )

    combined_trial_level_data = pd.concat(
        [
            with_norecs_speed,
            normed_pos_counts,
            progressive_tense.to_frame("progressive_tense"),
        ],
        axis=1,
    )

    combined_trial_level_data.to_csv(paths.analyzed / "combined_data.csv", index=False)

    (
        pd.concat(
            [pd.read_csv(paths.analyzed / f"block_{exp}.csv") for exp in batches],
            keys=batches,
            names=("experiment", "_idx"),
            sort=False,
        )
        .reset_index(level=0)
        .reset_index(drop=True)
        .to_csv(paths.analyzed / "combined_blocks.csv", index=False)
    )

    (
        pd.concat(
            [pd.read_csv(paths.analyzed / f"experiment_{exp}.csv") for exp in batches],
            keys=batches,
            names=("experiment", "_idx"),
            sort=False,
        )
        .reset_index(level=0)
        .reset_index(drop=True)
        .to_csv(paths.analyzed / "combined_experiments.csv", index=False)
    )


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--redo", action="store_true")
    opts = parser.parse_args()
    main(opts.redo)
