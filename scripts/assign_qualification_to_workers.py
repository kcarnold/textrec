#!/usr/bin/env python
"""
Assign qualifications to workers who have completed certain types of HITs.
"""

import sys
import json
import pathlib

import pandas as pd
import toolz

from parse_questionformanswer import parse_qfa

root = pathlib.Path("mturk-backup")
hits = [json.load(open(f)) for f in root.glob("*/meta.json")]

hits_by_title = toolz.groupby("Title", hits)

titles = {
    "Which image fits a given description?": "anno",
    "Pick the image that this sentence is more likely to be describing.": "anno",
    "Which images fit a given description?": "anno",
    "Which caption is more specific?": "anno",
    "Try writing with different mobile-phone keyboards": "write",
    "Try typing with different mobile-phone keyboards": "write",
    "Write a restaurant review": "write",
    "Write a movie review": "write",
    "Find images that people not in a certain group would misunderstand": "exploratory",
    "Write about 3 different topics [~30m]": "ideawrite",
    "Write about 3 different topics [~45m]": "ideawrite",
    "Write about a movie or TV show [~10min]": "ideawrite",
    "Write about a recent experience at a restaurant [<10min]": "ideawrite",
    "Write about a recent experience at a restaurant [~10min]": "ideawrite",
    "Write sentences about 3 different topics [~35m]": "design",
    "Write sentences about 3 different topics [~45m]": "design",
    "Rate informativeness and appropriateness of text": "rate",
}

known_irrelevant = """
Answer questions about a video
Create a face using shapes [duration: < 3 minutes]
Create a face using shapes [duration: < 6 minutes, if you have done this HIT before, please refrain from doing it again]
Create a face using shapes [duration: < 6 minutes]
Label sentences in a conversation between three people
Take our Negotiation Experiment
Take our VR experiment 
Take our VR experiment (SMARTPHONE REQUIRED)
Take our VR experiment (TABLET REQUIRED)
Tell us your opinion about these videos
Which image is more creative? [<1 minutes]
Which image is more creative? [<5 minutes]
""".strip().split(
    "\n"
)

relevant_hits = [hit for hit in hits if hit["Title"] in titles.keys()]
irrelevant_hits = {
    hit["Title"]
    for hit in hits
    if hit["Title"] not in titles and hit["Title"] not in known_irrelevant
}
if irrelevant_hits:
    print("ERR: uncategorized HITs:")
    print("\n".join(repr(t) for t in sorted(irrelevant_hits)))
    sys.exit(1)
id2hit = {hit["HITId"]: hit for hit in hits}


def lookup_type(hit_id):
    hit_title = id2hit[hit_id]["Title"]
    hit_type = titles[hit_title]
    return dict(hit_title=hit_title, hit_type=hit_type)


assignments = [
    dict(assignment, **lookup_type(assignment["HITId"]))
    for hit in relevant_hits
    for assignment in json.load(open(root / hit["HITId"] / "assignments.json"))
]

# Summarize workers by subgroup.
assignments_df = pd.DataFrame(assignments)
assignments_df["SubmitTime"] = pd.to_datetime(assignments_df["SubmitTime"])
print(assignments_df.groupby("hit_type").WorkerId.nunique())


def find_invalid_workers():
    assignments_by_worker = toolz.groupby("WorkerId", assignments)
    for worker_id, worker_assignments in assignments_by_worker.items():
        prev_hits = []
        for assignment in sorted(worker_assignments, key=lambda x: x["SubmitTime"]):
            hit_title = id2hit[assignment["HITId"]]["Title"]
            hit_type = titles[hit_title]
            if hit_type == "write":
                # if len(prev_hits) != 0:
                #     print("")
                prev_types = [typ for typ, hit in prev_hits]
                if prev_types != []:
                    qfa = parse_qfa(assignment["Answer"])
                    print("Writing after", ",".join(prev_types), worker_id, qfa)

            elif hit_type == "anno":
                if not all(typ == "anno" for typ, hit in prev_hits):
                    print("Anno after writing:", worker_id)
                    break

            elif hit_type == "exploratory":
                pass

            else:
                print("UNKNOWN HIT TYPE", hit_type, hit_title)
            prev_hits.append((hit_type, assignment))


def add_qualification(client, qualification_name, hit_type):
    workers = sorted(
        {
            assignment["WorkerId"]
            for assignment in assignments
            if assignment["hit_type"] == hit_type
        }
    )
    if len(workers) == 0:
        print("No workers did", hit_type)
        return
    print(
        f"Giving qualification {qualification_name}"
        f" to {len(workers)} workers who did {hit_type}:"
    )
    print(" ".join(workers))
    client.qualify_workers(client.get_qualification_id(qualification_name), workers)


if __name__ == "__main__":
    from mturk import MTurkClient

    client = MTurkClient(profile_name="iismturk", region_name="us-east-1")
    for hit_type in ["ideawrite", "design", "rate"]:
        add_qualification(client, "did-articles", hit_type)
