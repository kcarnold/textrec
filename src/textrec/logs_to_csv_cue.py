import pandas as pd
from . import analysis_util
from .paths import paths

from typing import List, Any

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


def get_trial_data(participants, analyses) -> List[Any]:
    results = []

    for participant_id in participants:
        analyzed = analyses[participant_id]

        controlledInputsDict = dict(analyzed["allControlledInputs"])
        if controlledInputsDict.get("postExp-shouldExclude") != "Use my data":
            print(controlledInputsDict)
            print("****** EXCLUDE! **********", participant_id)
            assert False

        assert len(analyzed["texts"]) == 1
        text = analyzed["texts"][0]
        data = {}
        data['participant'] = participant_id
        
        data["condition"] = text["condition"]
        data["text"] = text["text"]
        results.append(data)

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
            if "-" in k:
                segment, k = k.split("-", 1)
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

    analyses = analysis_util.get_log_analysis_many(participants)

    trial_level = get_trial_data(participants, analyses)
    trial_level = pd.DataFrame(trial_level)

    # Get survey data
    _experiment_level = get_survey_data(participants, analyses)
    experiment_level = decode_experiment_level(_experiment_level).reset_index()

    assert "participant" in experiment_level, experiment_level.info()
    assert "participant" in trial_level

    trial_level = pd.merge(
        experiment_level, trial_level, on="participant", validate="1:1"
    )

    return coerce_columns(trial_level, expected_columns)


def main(batch):
    participants = get_participants_by_batch()[batch]
    analyses = analyze_all(participants)
    analyses.to_csv(paths.data / "analyzed" / f"{batch}.csv", index=False)


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("batch")
    opts = parser.parse_args()
    main(opts.batch)
