import json
import boto3
import tqdm
import datetime


class MTurkClient:
    def __init__(self, profile_name, region_name):
        self.session = boto3.Session(profile_name=profile_name, region_name=region_name)
        self.client = self.session.client('mturk')

    def iter_all_hits(self):
        return (hit
            for page in self.client.get_paginator('list_hits').paginate() for hit in page['HITs'])

    def get_all_hits(self):
        return list(self.iter_all_hits())

    def get_assignments(self, hit_id):
        return [
            assignment
            for page in self.client.get_paginator('list_assignments_for_hit').paginate(HITId=hit_id)
            for assignment in page['Assignments']]

    def get_qualification_id(self, name):
        qualifications = self.client.list_qualification_types(MustBeRequestable=False, Query=name)['QualificationTypes']
        assert len(qualifications) == 1
        return qualifications[0]['QualificationTypeId']

    def qualify_workers(self, qualification_id, workers, value=1, send_notification=False):
        assert len(set(workers)) == len(workers)
        for worker_id in tqdm.tqdm(workers):
            self.client.associate_qualification_with_worker(
                QualificationTypeId=qualification_id,
                WorkerId=worker_id,
                IntegerValue=value,
                SendNotification=send_notification)


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

if __name__ == '__main__':
    client = MTurkClient(profile_name='iismturk', region_name='us-east-1')
