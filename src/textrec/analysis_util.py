import os
import json
import re
import numpy as np
import subprocess
from .util import mem
from .paths import paths

def get_rev(logpath):
    with open(logpath) as logfile:
        for line in logfile:
            line = json.loads(line)
            if 'rev' in line:
                return line['rev']
    raise ValueError(f"No git revision logged in {logpath}")


@mem.cache
def get_log_analysis_raw(logpath, logfile_size, git_rev, analysis_files=None):
    # Ignore analysis_files; just use them to know when to invalidate the cache.
    if not os.path.isdir(paths.old_code / git_rev):
        subprocess.check_call([paths.scripts / 'checkout-old.sh', git_rev])
    analyzer_path = str(paths.frontend / 'run-analysis')
    with open(logpath) as logfile:
        result = subprocess.check_output([analyzer_path], stdin=logfile)
        assert len(result) > 0
        return result


def get_log_analysis(participant, git_rev=None):
    analysis_files = {
        name: open(paths.frontend / name).read()
        for name in ['analyze.js', 'run-analysis', 'src/Analyzer.js']
    }
    logpath = paths.top_level / 'logs' / (participant+'.jsonl')
    if git_rev is None:
        git_rev = get_rev(logpath)
    logfile_size = os.path.getsize(logpath)

    result = get_log_analysis_raw(logpath, logfile_size, git_rev=git_rev, analysis_files=analysis_files)
    analyzed = json.loads(result)
    analyzed['git_rev'] = git_rev
    return analyzed
