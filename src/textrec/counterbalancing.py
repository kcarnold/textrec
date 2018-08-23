import json
import time
import numpy as np
from textrec.paths import paths
import logging
logger = logging.getLogger(__name__)

BATCH_DATA = {
    'gc1': dict(n_conditions=6, config='gcap')
}

SECS_PER_HOUR = 60 * 60

def get_login_event(log_file):
    with open(log_file) as f:
        return json.loads(next(f))


def completed_fname(participant_id, logdir):
    return logdir / f'{participant_id}.completed'


def get_completion_data(batch, logdir=paths.logdir):
    results = []
    for log_file in logdir.glob('*.jsonl'):
        try:
            login_event = get_login_event(log_file)
        except Exception:
            logger.warning(f"bad logfile {log_file}")
            continue
        if 'pyTimestamp' not in login_event:
            # Old logfiles lacked that.
            continue
        if login_event.get('type') != 'login':
            logger.warning(f"bad logfile {log_file}")
            continue
        if login_event.get('batch') != batch:
            continue
        participant_id = login_event['participant_id']
        results.append(dict(
            participant_id=participant_id,
            login_timestamp=login_event['pyTimestamp'],
            assignment=login_event['assignment'],
            completed=completed_fname(participant_id, logdir).exists()))
    return results


def mark_completed(participant_id, logdir=paths.logdir):
    completed_fname(participant_id, logdir).touch()

def get_expected_completions(num_conditions, completion_data, max_age_secs=12 * SECS_PER_HOUR):
    now = time.time()
    expected_completions = np.zeros(num_conditions)
    for completion in completion_data:
        assignment = completion['assignment']
        if completion['completed']:
            expected_completions[assignment] += 1.0
        else:
            age_secs = now - completion['login_timestamp']
            if age_secs < max_age_secs:
                # They might complete.
                expected_completions[assignment] += 0.5
            else:
                logger.debug(
                    f"Participant {completion['participant_id']} started too long ago ({age_secs/SECS_PER_HOUR:.1f}hr)")
    return expected_completions


def get_conditions_for_new_participant(batch):
    batch_data = BATCH_DATA[batch]
    completion_data = get_completion_data(batch)
    expected_completions = get_expected_completions(
        batch_data['n_conditions'],
        completion_data)
    # print(expected_completions)
    assignment = int(np.argmin(expected_completions))
    return dict(batch_data, assignment=assignment)
