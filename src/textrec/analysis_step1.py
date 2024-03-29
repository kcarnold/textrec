import pathlib
import pickle

import pandas as pd

from collections import OrderedDict as odict
from . import analysis_util
from .paths import paths

condition_name_map = dict(
    norecs="norecs",
    general="standard",
    always="standard",
    gated="gated",
    specific="contextual",
)

NUM_LIKERT_DEGREES_FOR_TRAITS = 5


class ColType:
    def __init__(self, type, **flags):
        self.type = type
        self.__dict__.update(flags)
        self.flags = flags


# Unfortunately, an `int` column can't contain missing data in Pandas 0.23.
# Looking forward to 0.24: http://pandas-docs.github.io/pandas-docs-travis/whatsnew.html#optional-integer-na-support
PossiblyMissingInt = ColType(float)
Count = ColType(int, fill=0)

BoxCox = ColType(float, boxcox=True)
TraitColumn = ColType(float, boxcox=True)

gender_map = {"fenale": "female", "f": "female", "make": "male"}

columns = {
    "participant": str,
    "age": float,
    "english_proficiency": str,
    "gender": ColType(str, lower=True, recode=gender_map),
    "other": str,
    "techDiff": str,
    "total_time": float,
    "verbalized_during": str,
    "condition": str,
    "prompt": str,
    "text": str,
    "num_chars": int,
    "num_words": int,
}


def divide_zerosafe(a, b):
    if b:
        return a / b
    else:
        return None


def coerce_columns(df, column_types):
    result = df.copy()
    column_order = []
    for column_name, typ in column_types.items():
        if not isinstance(typ, ColType):
            typ = ColType(typ)
        # Compute the column, if a function is provided.
        if "f" in typ.flags:
            result[column_name] = result.apply(typ.flags["f"], axis=1)
        elif column_name not in result.columns:
            assert typ.flags.get("optional", False), column_name
            continue
        column_order.append(column_name)
        if "fill" in typ.flags:
            result[column_name] = result[column_name].fillna(typ.flags["fill"])
        try:
            result[column_name] = result[column_name].astype(typ.type)
        except Exception:
            print(column_name, "Failed to coerce.")
            raise
        if "lower" in typ.flags:
            assert typ.type is str
            result[column_name] = result[column_name].str.lower()
        if "recode" in typ.flags:
            result[column_name] = result[column_name].apply(
                lambda x: typ.flags["recode"].get(x, x)
            )
    extra_columns = sorted(set(result.columns) - set(column_order))
    if len(extra_columns) != 0:
        print(f"\n\nExtra columns: {extra_columns}")
    return result[column_order + extra_columns]


def get_participants_by_batch():
    participants_by_batch = {}
    with open(paths.data / "participants.txt") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            batch_name, participants = line.split(":", 1)
            participants = participants.strip().split()
            assert len(participants) == len(set(participants))
            participants_by_batch[batch_name] = participants
    return participants_by_batch


def analyze_trial(trial):
    def fluency(trial):
        ideas = [evt for evt in trial["events"] if evt["type"] == "addIdea"]
        times = [evt["sinceStart"] / 1000 for evt in ideas]
        return [
            sum(1 for time in times if time < minutes * 60)
            for minutes in [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 99999]
        ]

    texts = [evt["idea"] for evt in trial["events"] if evt["type"] == "addIdea"]
    inspiration_requests = [
        evt["ideas"] for evt in trial["events"] if evt["type"] == "inspireMe"
    ]
    process_summary = []
    for evt in trial["events"]:
        if evt["type"] == "addIdea":
            process_summary.append(evt["idea"])
        elif evt["type"] == "inspireMe":
            process_summary.append("---")

    return odict(
        condition=trial["condition"],
        fluency=fluency(trial),
        # num_distinct_words=len(get_openclass_words(texts)),
        # mean_pairwise_dists=mean_pairwise_dists(texts),
        num_inspiration_requests=len(inspiration_requests),
        ideas_given=inspiration_requests,
        texts=texts,
        finalText=trial["finalText"],
        process_summary=process_summary,
    )


def get_behavioral_data(participants, analyses):
    trial_level_data = []
    inspiration_requests = []
    ideas = []

    for participant_id in participants:
        analysis = analyses[participant_id]

        controlledInputsDict = odict(analysis["allControlledInputs"])
        if controlledInputsDict.get("postExp-shouldExclude") != "Use my data":
            print(controlledInputsDict)
            print("****** EXCLUDE! **********", participant_id)
            assert False

        # Skip the practice round. Analyze the rest.
        for trial_idx, trial in enumerate(analysis["trials"][1:]):
            trial_analysis = analyze_trial(trial)
            num_blur = 0
            for evt_seq, evt in enumerate(trial["events"]):
                any_requests_returned_empty = False

                BASE = odict(
                    participant=participant_id,
                    block=trial_idx,
                    condition=trial_analysis["condition"],
                    trial_evt_seq=evt_seq,
                    since_start=evt["sinceStart"] / 1000,
                )

                if evt["type"] == "addIdea":
                    ideas.append(odict(BASE, text=evt["idea"]))
                elif evt["type"] == "inspireMe":
                    inspirations = evt["ideas"]
                    inspiration_requests.append(
                        odict(
                            BASE,
                            inspirations=inspirations,
                            num_inspirations=len(inspirations),
                        )
                    )
                    if len(inspirations) == 0:
                        any_requests_returned_empty = True
                elif evt["type"] == "blur":
                    num_blur += 1

            trial_level_data.append(
                odict(
                    trial_analysis,
                    participant=participant_id,
                    block=trial_idx,
                    any_requests_returned_empty=any_requests_returned_empty,
                    num_blur=num_blur
                    # , titleÁ=dict(analysis['allControlledInputs'])[CINAME[idx]])
                )
            )

    return {
        k: pd.DataFrame(v)
        for k, v in dict(
            trial_level=trial_level_data,
            inspiration_requests=inspiration_requests,
            ideas=ideas,
        ).items()
    }


def get_survey_data(participants, analyses):
    experiment_level = []
    trial_level = []

    for participant_id in participants:
        analyzed = analyses[participant_id]

        controlledInputsDict = dict(analyzed["allControlledInputs"])
        if controlledInputsDict.get("shouldExclude", "No") == "Yes":
            print("****** EXCLUDE! **********")
            assert False

        total_time = (
            analyzed["screenTimes"][-1]["timestamp"]
            - analyzed["screenTimes"][0]["timestamp"]
        )
        total_time = total_time / 1000 / 60
        experiment_level.append((participant_id, "total_time", total_time))

        for k, v in analyzed["allControlledInputs"]:
            if k.startswith("postBrainstorm") or k.startswith("postWriting"):
                segment, trial, k = k.split("-", 2)
                if trial == "practice":
                    # ignore.
                    pass
                else:
                    segment = segment[4:].lower()
                    trial = int(trial)
                    k = k.replace("-", "_")
                    trial_level.append((participant_id, trial, f"{segment}_{k}", v))
            else:
                experiment_level.append((participant_id, k, v))

    return dict(
        experiment_level=pd.DataFrame(
            experiment_level, columns="participant name value".split()
        ),
        trial_level=pd.DataFrame(
            trial_level, columns="participant block name value".split()
        ),
    )


def clean_merge(*a, must_match=[], combine_cols=[], **kw):
    res = pd.merge(*a, **kw)
    unclean = [col for col in res.columns if col.endswith("_x") or col.endswith("_y")]
    assert len(unclean) == 0, unclean
    assert "index" not in res
    return res


def analyze_all(participants):

    analyses = analysis_util.get_log_analysis_many(participants, analyzer="CueAnalyzer")

    behavioral_data = get_behavioral_data(participants, analyses)
    trial_level = behavioral_data.pop("trial_level")

    trial_level["fluency_1"] = trial_level.fluency.apply(lambda x: x[0])
    trial_level["fluency_2"] = trial_level.fluency.apply(lambda x: x[1])
    trial_level["fluency_5"] = trial_level.fluency.apply(lambda x: x[4])

    # Get survey data
    survey_data = get_survey_data(participants, analyses)
    experiment_level_survey = (
        survey_data["experiment_level"]
        .set_index(["participant", "name"])
        .value.unstack(-1)
        .reset_index()
    )
    trial_level_survey = (
        survey_data["trial_level"]
        .set_index(["participant", "block", "name"])
        .value.unstack(-1)
        .reset_index()
    )

    assert len(set(trial_level["participant"])) == len(
        set(experiment_level_survey["participant"])
    )

    trial_level = clean_merge(
        trial_level, trial_level_survey, on=("participant", "block"), validate="1:1"
    )

    experiment_level = clean_merge(
        experiment_level_survey,
        trial_level.groupby("participant")
        .condition.apply(lambda x: ",".join(x))
        .to_frame("condition_order"),
        left_on="participant",
        right_index=True,
    )

    trial_level["system_failure_occurred"] = (trial_level["condition"] != "norecs") & (
        trial_level["any_requests_returned_empty"]
    )

    trial_level["should_exclude"] = trial_level["system_failure_occurred"] | (
        trial_level["num_inspiration_requests"] == 0
    )

    experiment_level = clean_merge(
        experiment_level,
        trial_level.groupby("participant")
        .should_exclude.any()
        .to_frame("any_trial_excluded"),
        left_on="participant",
        right_index=True,
    )

    behavioral_data_with_exclusions = {
        k: clean_merge(
            trial_level.loc[:, ["participant", "block", "should_exclude"]],
            v,
            on=["participant", "block"],
        )
        for k, v in behavioral_data.items()
    }

    return dict(
        experiment_level=experiment_level,
        trial_level=trial_level,
        **behavioral_data_with_exclusions,
    )


def main(batch):
    participants = get_participants_by_batch()[batch]
    analyses = analyze_all(participants)
    out_path: pathlib.Path = paths.data / "analyzed" / "idea" / batch
    out_path.mkdir(parents=True, exist_ok=True)
    with open(out_path / "step1.pkl", "wb") as f:
        pickle.dump(analyses, f)

    for name, data in analyses.items():
        if name.endswith("_level"):
            name = name[: -len("_level")]
        data.to_csv(out_path / f"{name}.csv", index=False)
    return analyses


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("batch")
    opts = parser.parse_args()
    globals().update(main(opts.batch))
