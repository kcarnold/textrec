import hashlib
import json
import os
import subprocess

import ujson

from .paths import paths
from .util import mem

rev_overrides = {
    "8b70b51": "4d07df8",
    "024ef59": "3f52c04",
    "3761b2d": "66b19ec",
    "4740cdc": "ae035cf",
}


def get_rev(logpath):
    """Retrieve the **frontend** git revision from a log.

    The frontend includes a "git_rev" in each "hello" message,
    which the backend logs as:

    kind="meta", type="init", request=request

    Technically each reload of the frontend could theoretically be a different revision.
    For simplicity, we take just the first one.
    """
    with open(logpath) as logfile:
        for line in logfile:
            line = json.loads(line)
            # This would be a good use of assignment expressions, once they're released.
            if line.get("kind") == "meta" and line.get("type") == "init":
                request = line.get("request", {})
                if "git_rev" in request:
                    return request["git_rev"]
    raise ValueError(f"No git revision logged in {logpath}")


def sha1_file(filename):
    with open(filename, "rb") as f:
        return hashlib.sha1(f.read()).hexdigest()


def get_log_analysis(participant):
    return get_log_analysis_many([participant])[participant]


cheating_analysis_results = {}


@mem.cache
def get_raw_analysis_cheating(participant, logfile_size, git_rev, analysis_files):
    """Abuse the joblib cache to store the analysis results."""
    return cheating_analysis_results.get(participant, None)


def get_log_analysis_many(participants, analyzer):
    cheating_analysis_results.clear()

    analyzer_js = f"src/{analyzer}.js"

    analysis_files = {
        name: sha1_file(paths.frontend / name) for name in [analyzer_js]
    }

    analyses = {}
    todo = []
    revisions_needed = set()
    for participant in participants:
        logpath = (paths.top_level / "logs" / (participant + ".jsonl")).absolute()
        git_rev = get_rev(logpath)
        real_git_rev = rev_overrides.get(git_rev, git_rev)
        logfile_size = os.path.getsize(logpath)

        # See if we already have this analysis.
        analysis_raw = get_raw_analysis_cheating(
            participant, logfile_size, real_git_rev, analysis_files
        )

        if analysis_raw is None:
            # need to compute it.
            todo.append((participant, logpath, logfile_size, git_rev, real_git_rev))
            revisions_needed.add((git_rev, real_git_rev))
        else:
            # Result was cached.
            analyzed = ujson.loads(analysis_raw)
            analyzed["git_rev"] = git_rev
            analyses[participant] = analyzed

    if todo:
        logpaths = [str(x[1]) for x in todo]
        # Compute a batch of analyses.
        for git_rev, real_git_rev in revisions_needed:
            cmd = [str(paths.scripts / "checkout-old.sh"), git_rev, real_git_rev]
            print(" ".join(cmd))
            subprocess.check_call(cmd)
        analyzer_path = str(paths.frontend / "run-analysis")
        analyzer_cmd = [analyzer_path, "--", analyzer] + logpaths
        print(" ".join(analyzer_cmd))
        completion = subprocess.run(analyzer_cmd, stdout=subprocess.PIPE)

        for line in completion.stdout.split(b"\n"):
            if len(line) == 0:
                continue
            line = json.loads(line.decode("utf-8"))
            if "error" in line:
                print(f"Error processing {line['filename']}")
                error = json.loads(line["error"])
                print(error["message"])
                print(error["stack"])
                print()
            else:
                result = line["result"]
                participant_id = result["participant_id"]
                print(f"Got result for {participant_id}")
                analyses[participant_id] = result
                # Store results as JSON because it's faster than pickle.
                cheating_analysis_results[participant_id] = json.dumps(result)

        for participant, logpath, logfile_size, git_rev, real_git_rev in todo:
            # Store the analysis result.
            get_raw_analysis_cheating.call(
                participant, logfile_size, real_git_rev, analysis_files
            )

    cheating_analysis_results.clear()
    return analyses
