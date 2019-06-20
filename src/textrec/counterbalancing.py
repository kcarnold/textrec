import json
import time
import numpy as np
from textrec.paths import paths
import logging

logger = logging.getLogger(__name__)

BATCH_DATA = {
    "gc1": dict(n_groups=6, config="gcap"),
    "spec2": dict(n_groups=6, config="cap"),
    "xs1": dict(n_groups=6, config="gx"),
    "cue0": dict(
        n_groups=3, config="cue"
    ),  # BASELINE, only one actual condition (norecs).
    "cue1": dict(
        n_groups=3, config="cue"
    ),  # This is norecs vs static-phrases vs static-sentences.
    "cue2": dict(
        n_groups=3, config="cue"
    ),  # This is norecs vs static-phrases vs static-sentences, longer.
    "idea0": dict(
        n_groups=1, config="idea"
    ),  # This is piloting the brainstorming task.
    "idea1r": dict(
        n_groups=3, config="idea", prompt="restaurant"
    ),  # First actual run of the cueing ideation task. With closing writing.
    "idea2r": dict(
        n_groups=3, config="idea", prompt="restaurant"
    ),  # Second run. Closing writing, explicit brainstorming instructions.
    "idea2m": dict(
        n_groups=3, config="idea", prompt="movie"
    ),  # Same as idea2r, but for movies.
    "idea3pilot": dict(n_groups=3, config="idea"),  # Within-subjects, new prompts.
    "idea3r1": dict(n_groups=3, config="idea"),  # Actually enable cues.
    "idea3r2": dict(n_groups=3, config="idea"),  # Word cues!
    "idea3r3": dict(n_groups=3, config="idea"),  # Wikipedia tasks.
    "idea3r4": dict(n_groups=6, config="idea"),  # With post-writing surveys.
    "idea3r5": dict(n_groups=6, config="idea"),  # So much fixed!
    "design1": dict(config="act", n_groups=6),  # Cue design experiment
}

invalid = set("h52x67 3vf5fg 73qq5q ffhgxm mhh838 j39263 pqf6q5 49cm8f".split())

SECS_PER_HOUR = 60 * 60


def get_login_event(log_file):
    with open(log_file) as f:
        return json.loads(next(f))


def completed_fname(participant_id, logdir):
    return logdir / f"{participant_id}.completed"


def get_completion_data(batch, logdir=paths.logdir):
    results = []
    for log_file in logdir.glob("*.jsonl"):
        try:
            login_event = get_login_event(log_file)
        except Exception:
            logger.warning(f"bad logfile {log_file}")
            continue
        if "pyTimestamp" not in login_event:
            # Old logfiles lacked that.
            continue
        if login_event.get("type") != "login":
            logger.warning(f"bad logfile {log_file}")
            continue
        if login_event.get("batch") != batch:
            continue
        participant_id = login_event["participant_id"]
        if participant_id in invalid:
            continue
        results.append(
            dict(
                participant_id=participant_id,
                login_timestamp=login_event["pyTimestamp"],
                assignment=login_event["assignment"],
                completed=completed_fname(participant_id, logdir).exists(),
            )
        )
    return results


def mark_completed(participant_id, logdir=paths.logdir):
    completed_fname(participant_id, logdir).touch()


def get_expected_completions(
    n_groups, completion_data, timeout=3 * SECS_PER_HOUR
):
    now = time.time()
    expected_completions = np.zeros(n_groups)
    for completion in completion_data:
        assignment = completion["assignment"]
        if completion["completed"]:
            expected_completions[assignment] += 1.0
        else:
            age_secs = now - completion["login_timestamp"]
            if age_secs < timeout:
                # They might complete.
                expected_completions[assignment] += 0.5
            else:
                logger.debug(
                    f"Participant {completion['participant_id']} started too long ago ({age_secs/SECS_PER_HOUR:.1f}hr)"
                )
    return expected_completions


def get_conditions_for_new_participant(batch):
    batch_data = BATCH_DATA[batch]
    completion_data = get_completion_data(batch)
    expected_completions = get_expected_completions(
        batch_data["n_groups"], completion_data
    )
    # print(expected_completions)
    assignment = int(np.argmin(expected_completions))
    return dict(batch_data, assignment=assignment)
