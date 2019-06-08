import pandas as pd
from . import analysis_util
from .paths import paths
import pickle

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

    return dict(
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


def get_trial_level_data(participants, analyses):
    results = []

    for participant_id in participants:
        analysis = analyses[participant_id]

        controlledInputsDict = dict(analysis["allControlledInputs"])
        if controlledInputsDict.get("postExp-shouldExclude") != "Use my data":
            print(controlledInputsDict)
            print("****** EXCLUDE! **********", participant_id)
            assert False

        # Skip the practice round. Analyze the rest.
        for idx, trial in enumerate(analysis["trials"][1:]):
            results.append(
                dict(
                    analyze_trial(trial),
                    participant=participant_id,
                    block=idx
                    # , titleÁ=dict(analysis['allControlledInputs'])[CINAME[idx]])
                )
            )

    return results


def get_survey_data(participants, analyses):
    experiment_level = []

    for participant_id in participants:
        analyzed = analyses[participant_id]

        controlledInputsDict = dict(analyzed["allControlledInputs"])
        if controlledInputsDict.get("shouldExclude", "No") == "Yes":
            print("****** EXCLUDE! **********")
            assert False

        total_time = (
            (
                analyzed["screenTimes"][-1]["timestamp"]
                - analyzed["screenTimes"][0]["timestamp"]
            )
            / 1000
            / 60
        )
        experiment_level.append((participant_id, "total_time", total_time))

        for k, v in analyzed["allControlledInputs"]:
            # if "-" in k:
            #     segment, k = k.split("-", 1)
            experiment_level.append((participant_id, k, v))

    return pd.DataFrame(experiment_level, columns="participant name value".split())


def decode_experiment_level(experiment_level):
    return experiment_level.set_index(["participant", "name"]).value.unstack(-1)


def clean_merge(*a, must_match=[], combine_cols=[], **kw):
    res = pd.merge(*a, **kw)
    unclean = [col for col in res.columns if col.endswith("_x") or col.endswith("_y")]
    assert len(unclean) == 0, unclean
    assert "index" not in res
    return res


def analyze_all(participants):
    expected_columns = columns.copy()

    analyses = analysis_util.get_log_analysis_many(participants, analyzer="CueAnalyzer")

    trial_level = get_trial_level_data(participants, analyses)
    trial_level = pd.DataFrame(trial_level)

    trial_level['fluency_1'] = trial_level.fluency.apply(lambda x: x[0])
    trial_level['fluency_2'] = trial_level.fluency.apply(lambda x: x[1])
    trial_level['fluency_5'] = trial_level.fluency.apply(lambda x: x[4])


    # Get survey data
    _experiment_level = get_survey_data(participants, analyses)
    experiment_level = decode_experiment_level(_experiment_level).reset_index()

    assert "participant" in experiment_level, experiment_level.info()
    assert "participant" in trial_level

    # trial_level = pd.merge(
    #     experiment_level, trial_level, on="participant", validate="1:1"
    # )

    # return coerce_columns(trial_level, expected_columns)
    return trial_level


def main(batch):
    participants = get_participants_by_batch()[batch]
    analyses = analyze_all(participants)
    out_path = paths.data / "analyzed" / "idea" / batch
    with open(out_path / "step1.pkl", "wb") as f:
        pickle.dump(analyses, f)
    analyses.to_csv(out_path / "step1.csv", index=False)


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("batch")
    opts = parser.parse_args()
    main(opts.batch)
