"""
Add automated measures.
"""
import json
import pathlib
import pickle

import numpy as np

from textrec.paths import paths
from textrec.util import mem
from textrec import gpt2

cached_gpt2_nll = mem.cache(gpt2.nll)


def main(batch):
    # We compute NLL on lowercased text because capitalization was inconsistent.

    batch_path: pathlib.Path = paths.data / "analyzed" / "idea" / batch
    with open(batch_path / "step1.pkl", "rb") as f:
        analyses = pickle.load(f)

    trials = analyses["trial_level"]
    trials["nll_total_lower"] = trials.finalText.apply(
        lambda txt: cached_gpt2_nll(txt.strip().lower())
    )
    trials["nll_per_char"] = trials.nll_total_lower / trials.finalText.str.len()

    with open(batch_path / "step3.pkl", "wb") as f:
        pickle.dump(analyses, f)
    for name, data in analyses.items():
        if name.endswith("_level"):
            name = name[: -len("_level")]
        data.to_csv(batch_path / f"{name}.csv", index=False)

    return analyses


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("batch")
    opts = parser.parse_args()
    globals().update(main(opts.batch))
