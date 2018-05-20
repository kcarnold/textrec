import pathlib
import tqdm
import json
import datetime

from mturk import MTurkClient

def backup_mturk(client, root_path):
    import pandas as pd
    all_hits = client.get_all_hits()
    for hit in tqdm.tqdm(all_hits):
        hit_id = hit['HITId']
        hit_dir = root_path / hit_id
        hit_dir.mkdir(exist_ok=True)
        with open(hit_dir / 'meta.json', 'w') as f:
            json.dump(hit, f, default=serialize_datetime)

        assignments = client.get_assignments(hit_id)
        with open(hit_dir / 'assignments.json', 'w') as f:
            json.dump(assignments, f, default=serialize_datetime)

        pd.DataFrame(assignments).to_csv(str(hit_dir / 'assignments.csv'), index=False)


def serialize_datetime(obj):
    if isinstance(obj, (datetime.datetime, datetime.date)):
        return obj.isoformat()
    raise TypeError ("Type %s not serializable" % type(obj))


if __name__ ==  '__main__':
    client = MTurkClient(profile_name='iismturk', region_name='us-east-1')
    root = pathlib.Path('mturk-backup')
    root.mkdir(exist_ok=True)
    backup_mturk(client, root_path=root)