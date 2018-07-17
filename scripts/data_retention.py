import shutil
import pathlib
import subprocess
import pandas as pd
import tqdm
import glob
import json


all_csvs = subprocess.check_output(['mdfind', '-0', '-name', '.csv']).decode('utf8').split('\0')
all_csvs.sort()

def get_batch_results_csvs(candidate_csvs):
    all_batch_results = []
    for fname in sorted(set(all_csvs)):
        if not fname.endswith('.csv'):
            print("Skipping", fname)
            continue
        with open(fname, 'rb') as f:
            for line in f:
                if b'AssignmentId' in line and b'WorkerId' in line:
                    all_batch_results.append(fname)
                break
    return all_batch_results


backup_dir = pathlib.Path('backup_before_deidentification')

def backup(files, backup_dir):
    backup_dir.mkdir(exist_ok=True)

    for fname in files:
        assert '__' not in fname
        backup_name = fname.replace('/', '__')
        shutil.copy2(fname, backup_dir / backup_name)


def delete_worker_id_column(files, backup_dir):
    for fname in files:
        backup_name = fname.replace('/', '__')
        df = pd.read_csv(str(backup_dir / backup_name))
        del df['WorkerId']
        df.to_csv(fname, index=False)



logs = []
for dir in 'suggestion textrec'.split():
    logs.extend(glob.glob(f'/Users/kcarnold/code/{dir}/logs*/*.jsonl'))



for fname in logs:
    with open(fname) as f:
#         print(fname)
        line = None
        for line in f:
            break
        if line is None:
            continue
        data = json.loads(line)
        if 'platform_id' in data:
            print(data['platform_id'])
        


def deidentify_log(fname):
    with open(fname) as f:
        data = [json.loads(line) for line in f]
    if len(data) == 0:
        return
    login_event = data[0]
    if login_event.get('platform_id') is not None:
        pid = login_event['platform_id']
        deidentified = pid[:4]
        print(pid, deidentified)
        login_event['platform_id'] = deidentified
        with open(fname, 'w') as f:
            for event in data:
                print(json.dumps(event), file=f)

for fname in tqdm.tqdm_notebook(logs):
    deidentify_log(fname)

