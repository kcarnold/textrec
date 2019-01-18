import datetime
import glob
import json
import os
import pathlib
import re

import dateutil.parser
import toolz

from textrec.paths import paths

override_batch = {}
for p in "gmq64w xq9hcm qj5rm6 fg392m".split():
    override_batch[p] = "xs0"


def get_invalid():
    invalid = set()
    with open(paths.data / "invalid.txt") as f:
        for line in f:
            line = re.sub(r"#.+", "", line)
            line = line.strip()
            if not line:
                continue
            invalid.add(line)
    return invalid


INVALID = get_invalid()


print(f"{len(INVALID)} invalid")


def get_log_data(log_file, earliest):
    size = os.path.getsize(log_file)
    meta = None
    num_nexts = 0
    with open(log_file) as f:
        for idx, line in enumerate(f):
            if "next" not in line and "login" not in line and "finalData" not in line:
                continue
            line = json.loads(line)
            if line.get("type") == "next":
                num_nexts += 1
            elif line.get("type") == "login":
                if "jsTimestamp" in line:
                    timestamp = datetime.datetime.fromtimestamp(
                        line["jsTimestamp"] / 1000
                    )
                else:
                    timestamp = dateutil.parser.parse(line["timestamp"])
                if timestamp < earliest:
                    return
                platform_id = line["platform_id"]
                participant_id = line["participant_id"]
                batch = line.get("batch")
                batch = override_batch.get(participant_id, batch)
                meta = dict(
                    timestamp=timestamp,
                    batch=batch,
                    config=line["config"],
                    platform_id=platform_id,
                    participant_id=participant_id,
                    size=size,
                    complete=False,
                )  # will override
            elif line.get("type") == "finalData":
                #                 meta['finalData'] = line['finalData']
                meta["complete"] = True
    if meta:
        return dict(meta, num_nexts=num_nexts)


def get_logs(log_path, earliest):
    log_files = []
    for log_file in log_path.glob("*.jsonl"):
        data = get_log_data(log_file, earliest)
        if data is not None:
            log_files.append(data)
    return log_files


log_files = get_logs(
    paths.top_level / "logs-gcp1", earliest=datetime.datetime(2018, 5, 2)
)
not_invalid = [entry for entry in log_files if entry["participant_id"] not in INVALID]
complete = [entry for entry in not_invalid if entry["complete"]]
complete.sort(key=lambda x: x["timestamp"])

complete_by_group = {
    config: [
        participant["participant_id"]
        for participant in sorted(group, key=lambda x: x["timestamp"])
    ]
    for config, group in toolz.groupby("batch", complete).items()
}


# Dump a list of participant_ids
for config, group in complete_by_group.items():
    print()
    print(f"{len(group)} completed in {config}")
    print(f"{config}:", " ".join(group))
