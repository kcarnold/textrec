import os
import json
import re
import numpy as np
import subprocess
import hashlib
from .util import mem
from .paths import paths

rev_overrides = {
    '8b70b51': '4d07df8',
    '024ef59': '3f52c04',
    '3761b2d': '66b19ec'
}

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
    subprocess.check_call([paths.scripts / 'checkout-old.sh', git_rev, rev_overrides.get(git_rev, git_rev)])
    analyzer_path = str(paths.frontend / 'run-analysis')
    with open(logpath) as logfile:
        result = subprocess.check_output([analyzer_path], stdin=logfile)
        assert len(result) > 0
        return result


def get_log_analysis(participant, git_rev=None):
    analysis_files = {
        name: hashlib.sha1(open(paths.frontend / name, 'rb').read()).hexdigest()
        for name in ['analyze.js', 'run-analysis', 'src/Analyzer.js']
    }
    logpath = paths.top_level / 'logs' / (participant+'.jsonl')
    if git_rev is None:
        git_rev = get_rev(logpath)
    logfile_size = os.path.getsize(logpath)

    result = get_log_analysis_raw(str(logpath), logfile_size, git_rev=git_rev, analysis_files=analysis_files)
    analyzed = json.loads(result)
    analyzed['git_rev'] = git_rev
    return analyzed
