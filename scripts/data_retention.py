import shutil
import pathlib
import subprocess
import pandas as pd
import tqdm
import glob
import json
import datetime

# TODO: actually use this to only remove old identifiers.
oldest_time = datetime.datetime.now() - datetime.timedelta(days=30 * 6)

all_csvs = (
    subprocess.check_output(["mdfind", "-0", "-name", ".csv"])
    .decode("utf8")
    .split("\0")
)
all_csvs.sort()


def get_batch_results_csvs(candidate_csvs):
    all_batch_results = []
    skips = []
    errors = []
    for fname in tqdm.tqdm(sorted(set(candidate_csvs)), desc="Finding MTurk CSVs"):
        if 'backup_before_deidentification' in fname or not fname.endswith(".csv"):
            skips.append(fname)
            continue
        try:
            with open(fname, "rb") as f:
                for line in f:
                    if b"AssignmentId" in line and b"WorkerId" in line:
                        all_batch_results.append(fname)
                    break
        except OSError:
            errors.append(fname)
    if skips:
        print("Skips:")
        print('\n'.join(skips))
    if errors:
        print("Errors:")
        print('\n'.join(errors))
    return all_batch_results


backup_dir = pathlib.Path.home() / "backup_before_deidentification"


def backup(fname, backup_dir):
    backup_dir.mkdir(exist_ok=True)
    assert "__" not in fname
    backup_name = fname.replace("/", "__")
    backup_path = backup_dir / backup_name
    shutil.copy2(fname, backup_path)
    return backup_path


def delete_worker_id_column(files, backup_dir):
    for fname in tqdm.tqdm(files, desc="Deleting worker ID column"):
        backup_path = backup(fname, backup_dir)
        df = pd.read_csv(str(backup_path))
        del df["WorkerId"]
        df.to_csv(fname, index=False)


logs = []
for dir in "suggestion textrec".split():
    logs.extend(glob.glob(f"/Users/kcarnold/thesis/{dir}/logs*/*.jsonl"))


def deidentify_log(fname):
    with open(fname) as f:
        data = [json.loads(line) for line in f]
    if len(data) == 0:
        return
    login_event = data[0]
    if login_event.get("platform_id") is not None:
        pid = login_event["platform_id"]
        deidentified = pid[:4]
        print(pid, deidentified)
        login_event["platform_id"] = deidentified
        with open(fname, "w") as f:
            for event in data:
                print(json.dumps(event), file=f)


# TODO: Deidentify the MTurk backup too.

if __name__ == '__main__':
    all_batch_results = get_batch_results_csvs(all_csvs)
    delete_worker_id_column(all_batch_results, backup_dir)

    for fname in tqdm.tqdm(logs, desc="Deidentify logs"):
        deidentify_log(fname)
