import pandas as pd
import numpy as np
from textrec.paths import paths


experiments = ["gc1", "spec2"]
frames = [
    pd.read_csv(paths.analyzed / f"trial_withmanual_{exp}.csv") for exp in experiments
]
# Approach based on https://stackoverflow.com/a/48064892/69707
columns_ordered = []
for frame in frames:
    for col in frame.columns:
        if col not in columns_ordered:
            columns_ordered.append(col)
all_data = (
    pd.concat(frames, keys=experiments, names=("experiment", "_idx"), sort=False)[
        columns_ordered
    ]
    .reset_index(level=0)
    .reset_index(drop=True)
)


all_data["condition_mapped"] = all_data.condition.map(
    lambda x: {"always": "general"}.get(x, x)
)
all_data["condition_order_mapped"] = all_data.condition_order.map(
    lambda x: x.replace("always", "general")
)
all_data["first_block_condition"] = all_data.condition_order.map(
    lambda x: x.split(",", 1)[0]
)
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
    with_norecs_speed.characters_per_sec / with_norecs_speed.chars_per_sec_norecs_mean
)
with_norecs_speed["chars_per_sec_ratio_to_norecs_log"] = np.log(
    with_norecs_speed.chars_per_sec_ratio_to_norecs
)

# import scipy.stats
# with_norecs_speed['chars_per_sec_ratio_to_norecs_boxcox'], boxcox_lambda = scipy.stats.boxcox(with_norecs_speed.chars_per_sec_ratio_to_norecs)

with_norecs_speed.to_csv(paths.analyzed / "combined_data.csv", index=False)


(
    pd.concat(
        [pd.read_csv(paths.analyzed / f"block_{exp}.csv") for exp in experiments],
        keys=experiments,
        names=("experiment", "_idx"),
        sort=False,
    )
    .reset_index(level=0)
    .reset_index(drop=True)
    .to_csv(paths.analyzed / "combined_blocks.csv", index=False)
)

(
    pd.concat(
        [pd.read_csv(paths.analyzed / f"experiment_{exp}.csv") for exp in experiments],
        keys=experiments,
        names=("experiment", "_idx"),
        sort=False,
    )
    .reset_index(level=0)
    .reset_index(drop=True)
    .to_csv(paths.analyzed / "combined_experiments.csv", index=False)
)
