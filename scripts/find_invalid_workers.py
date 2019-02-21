#!/usr/bin/env python
"""
Find anyone who did the experiment or the annotation after already seeing the target images.
"""

import pathlib
import json
import toolz
from parse_questionformanswer import parse_qfa

root = pathlib.Path('mturk-backup')
hits = [json.load(open(f)) for f in root.glob('*/meta.json')]

hits_by_title = toolz.groupby('Title', hits)

titles = {
    'Which image fits a given description?': 'anno',
    'Pick the image that this sentence is more likely to be describing.': 'anno',
    'Which images fit a given description?': 'anno',
    'Try writing with different mobile-phone keyboards': 'write',
    'Try typing with different mobile-phone keyboards': 'write,'
}

relevant_hits = [hit for hit in hits if hit['Title'] in titles.keys()]
irrelevant_hits = {hit['Title'] for hit in hits if hit['Title'] not in titles}
if irrelevant_hits:
    print()
    print("Skipping other HITS:")
    print("\n".join(irrelevant_hits))
    print()
id2hit = {hit['HITId']: hit for hit in hits}

assignments = [
    assignment
    for hit in relevant_hits
    for assignment in json.load(open(root / hit['HITId'] / 'assignments.json'))]

assignments_by_worker = toolz.groupby('WorkerId', assignments)
for worker_id, worker_assignments in assignments_by_worker.items():
    prev_hits = []
    for assignment in sorted(worker_assignments, key=lambda x: x['SubmitTime']):
        hit_type = titles[id2hit[assignment['HITId']]['Title']]
        if hit_type == 'write':
            # if len(prev_hits) != 0:
            #     print("")
            prev_types = [typ for typ, hit in prev_hits]
            if prev_types != []:
                qfa = parse_qfa(assignment['Answer'])
                print("Writing after", ','.join(prev_types), worker_id, qfa)

        else:
            assert hit_type == 'anno'
            if not all(typ == 'anno' for typ, hit in prev_hits):
                print("Anno after writing:", worker_id)
                break
        prev_hits.append((hit_type, assignment))


def add_qualification(client):
    client.qualify_workers(client.get_qualification_id('did-captioning'), assignments_by_worker.keys())

if __name__ == '__main__':
    from mturk import MTurkClient
    client = MTurkClient(profile_name='iismturk', region_name='us-east-1')
    add_qualification(client)
