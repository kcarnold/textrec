import datetime
import json
import os
import pathlib
from contextlib import contextmanager

import matplotlib as mpl
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
import seaborn as sns
import toolz
import yaml

from textrec.paths import paths


def figout(filename, figpath=paths.figures):
    if not os.path.isabs(filename):
        filename = os.path.join(figpath, filename)
    plt.savefig(str(filename) + ".pdf", metadata={"creationDate": None})


@contextmanager
def fig(filename, **kw):
    f = plt.figure()
    yield
    figout(filename, **kw)
    plt.close(f)


sns.set_context("paper")
sns.set_style("whitegrid")


# from textrec import analysis_util, util, notebook_util
# reload(analysis_util), reload(util), reload(notebook_util), reload(automated_analyses)
# from textrec.notebook_util import images, id2img, id2url, show_images


os.chdir(paths.top_level)

friendly_names = {"ideal_taps_per_word_corrected": "Taps per Typo-Corrected Word"}


# Load results of writing experiment
# Prerequisites: Run `make data/analyzed/combined_data.csv`.

# experiments = ['gc1', 'spec2']
experiment_level_data = pd.read_csv(paths.analyzed / f"combined_experiments.csv")
block_level_data = pd.read_csv(paths.analyzed / f"combined_blocks.csv")
trial_level_data = pd.read_csv(
    paths.analyzed / f"combined_data.csv", dtype={"stimulus": str}
)


# trial_level_data = pd.read_csv(paths.analyzed / f'trial_{batch}.csv')
# helpful_ranks_by_condition = pd.read_csv(paths.analyzed / f'helpful_ranks_by_condition_{batch}.csv').set_index('index')

assert len(trial_level_data[trial_level_data["corrected_text"].isnull()]) == 0

for col in "participant condition stimulus".split():
    trial_level_data[col] = trial_level_data[col].astype("category")

trial_level_data["backspaces_per_word"] = (
    trial_level_data["num_tapBackspace"] / trial_level_data["num_words"]
)
trial_level_data["taps_per_char"] = (
    trial_level_data["num_taps"] / trial_level_data["num_chars"]
)
trial_level_data["uncorrected_errors_per_word"] = (
    trial_level_data["uncorrected_errors"] / trial_level_data["num_words"]
)

# recs_trials = trial_level_data.query('condition != "norecs"')

experiment_level_data.gender = experiment_level_data.gender.str.strip()
assert len(experiment_level_data.gender.value_counts(dropna=False)) == 3


data = dict(
    num_participants=len(set(trial_level_data.participant)),
    non_male=(experiment_level_data.gender != "male").sum().item(),
    num_trials_per=trial_level_data.groupby("participant").size().mean().item(),
    n_trials=len(trial_level_data),
)


for exp, group in experiment_level_data.groupby("experiment"):
    data.setdefault(exp, {})
    data[exp]["num_participants"] = len(group)
    helpfulness_columns = [
        col for col in experiment_level_data.columns if col.startswith("helpfulRank")
    ]
    helpful_ranks = group[helpfulness_columns]
    helpful_ranks = helpful_ranks.rename(
        columns={col: col[len("helpfulRank-") :] for col in helpfulness_columns}
    )

    helpful_ranks_by_condition = (
        helpful_ranks[
            [col for col in helpful_ranks.columns if col.endswith("condition")]
        ]
        .apply(pd.value_counts)
        .fillna(0)
        .astype(int)
    )
    data[exp]["helpful_most_votes"] = (
        helpful_ranks_by_condition.loc[
            :, [col for col in helpful_ranks_by_condition.columns if "most" in col]
        ]
        .sum(axis=1)
        .to_dict()
    )
    data[exp]["helpful_least_votes"] = (
        helpful_ranks_by_condition.loc[
            :, [col for col in helpful_ranks_by_condition.columns if "least" in col]
        ]
        .sum(axis=1)
        .to_dict()
    )

data["used_predictive"] = {
    k.replace(" ", "_"): v
    for k, v in experiment_level_data.use_predictive.value_counts().to_dict().items()
}
data[
    "verbalized_during"
] = experiment_level_data.verbalized_during.value_counts().to_dict()
print("used_predictive", data["used_predictive"])


with fig("trait_distribution"):
    experiment_level_data.plot.scatter(x="Extraversion", y="NFC")
    plt.xlim([0, 1])
    plt.ylim([0, 1])


def latexify_conds(txt):
    for cond in "norecs standard contextual gated".split():
        txt = txt.replace(cond, f"\\S{cond}")
    return txt


covc = experiment_level_data.groupby("experiment").condition_order.value_counts()
covc.name = "Num participants"
covc = covc.to_latex()
covc = covc.replace(",", ", ")
covc = latexify_conds(covc)
print(covc)
data["condition_order_table"] = covc


def summarize_means(df, by, outcome):
    means = df.groupby(by)[outcome].mean()
    data[f"{outcome}_means"] = means.to_dict()
    for exp, group in df.groupby("experiment"):
        data[exp][f"{outcome}_means"] = group.groupby(by)[outcome].mean().to_dict()
    return ", ".join(
        f"{name}={group_mean:.2f}" for name, group_mean in means.iteritems()
    )


def analyze_outcome(df, by, outcome):
    assert outcome in df.columns, outcome
    with fig(outcome):
        axs = sns.barplot(x=by, y=outcome, data=df, capsize=.2)
        for rect in list(axs.findobj(mpl.patches.Rectangle))[:-1]:
            height = rect.get_height()
            if np.isnan(height):
                continue
            axs.text(
                rect.get_x() + rect.get_width() / 2.,
                height,
                f"{height:.2f}",
                ha="center",
                va="bottom",
            )
        plt.ylabel(friendly_names.get(outcome, outcome))
        return summarize_means(df, by, outcome)


analyze_outcome(block_level_data, "condition", "TLX_sum")

trial_outcomes = [
    "num_words",
    "taps_per_word",
    "taps_per_char",
    "backspaces_per_word",
    "uncorrected_errors_per_word",
    "characters_per_sec",
    "ideal_taps_per_word_corrected",
    "mean_log_freq",
]
for outcome in trial_outcomes:
    analyze_outcome(trial_level_data, "condition", outcome)


data_fname = paths.analyzed / "data.yaml"
with open(data_fname, "w") as f:
    yaml.safe_dump(data, f)
