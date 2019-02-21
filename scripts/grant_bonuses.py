#import pathlib
import json

import toolz

from mturk import MTurkClient
#from parse_questionformanswer import parse_qfa
from textrec.paths import paths

root = paths.top_level / 'mturk-backup'
hits = [json.load(open(f)) for f in root.glob('*/meta.json')]

hits_by_title = toolz.groupby('Title', hits)

titles = {
    # 'Which image fits a given description?': 'anno',
    # 'Pick the image that this sentence is more likely to be describing.': 'anno',
    # 'Which images fit a given description?': 'anno',
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

#for assignment in assignments:
#    assignment['Answer'] = dict(parse_qfa(assignment["Answer"]))


def find_assignment_for_participant(participant_id):
    for assignment in assignments:
        if participant_id in assignment['Answer']:
            return assignment




if __name__ == "__main__":
    client = MTurkClient(profile_name="iismturk", region_name="us-east-1")
    import pandas as pd
    to_bonus = pd.read_csv('../2019-02-21-bonuses.csv')
    for row in to_bonus.itertuples():
        assignment = find_assignment_for_participant(row.participant)
        reason = f"You wrote one of the most specific captions for one or more of the images in our smartphone writing study. Thanks!"
        params = dict(
            WorkerId=assignment["WorkerId"],
            BonusAmount=f"{row.n * .50:.2f}",
            AssignmentId=assignment["AssignmentId"],
            Reason=reason,
            UniqueRequestToken=row.participant)
        print(params)
        client.client.send_bonus(**params)
