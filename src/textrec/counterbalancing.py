import json
import time
import numpy as np
from textrec.paths import paths

BATCH_DATA = {
    'gc1': dict(n_conditions=6, config='gcap')
}

SECS_PER_HOUR = 60 * 60

def get_login_event(log_file):
    with open(log_file) as f:
        return json.loads(next(f))


def completed_fname(participant_id, logdir):
    return logdir / f'{participant_id}.completed'


def get_completion_data(batch, max_age_secs=12 * SECS_PER_HOUR, logdir=paths.logdir):
    now = time.time()
    oldest_timestamp = now - max_age_secs
    results = []
    for log_file in logdir.glob('*.jsonl'):
        try:
            login_event = get_login_event(log_file)
        except Exception:
            print("Warning: bad logfile", log_file)
            continue
        if 'pyTimestamp' not in login_event:
            # Old logfiles lacked that.
            continue
        if login_event.get('type') != 'login':
            print("Warning: bad logfile", log_file)
            continue
        if login_event.get('batch') != batch:
            continue
        if login_event['pyTimestamp'] < oldest_timestamp:
            print("Skipping old", log_file)
            continue
        participant_id = login_event['participant_id']
        results.append(dict(
            participant_id=participant_id,
            assignment=login_event['assignment'],
            completed=completed_fname(participant_id, logdir).exists()))
    return results


def mark_completed(participant_id, logdir=paths.logdir):
    completed_fname(participant_id, logdir).touch()


def get_conditions_for_new_participant(batch):
    batch_data = BATCH_DATA[batch]
    completion_data = get_completion_data(batch)
    expected_completions = np.zeros(batch_data['n_conditions'])
    print(completion_data)
    for completion in completion_data:
        indicator = 1.0 if completion['completed'] else 0.5
        expected_completions[completion['assignment']] += indicator
    print(expected_completions)
    assignment = int(np.argmin(expected_completions))
    return dict(batch_data, assignment=assignment)
