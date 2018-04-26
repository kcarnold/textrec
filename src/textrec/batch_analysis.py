from .paths import paths
from . import analysis_util
from collections import Counter
import toolz

def get_participants_by_batch():
    participants_by_batch = {}
    with open(paths.data / 'participants.txt') as f:
        for line in f:
            if line.startswith('#'):
                continue
            batch_name, participants = line.strip().split(':', 1)
            participants = participants.strip().split()
            participants_by_batch[batch_name] = participants
    return participants_by_batch


def summarize(batch):
    participants = get_participants_by_batch()[batch]
    for pid in participants:
        print()
        print(pid)
        analyzed = analysis_util.get_log_analysis(pid)

        controlledInputsDict = dict(analyzed['allControlledInputs'])
        if controlledInputsDict.get('shouldExclude', "No") == "Yes":
            print("****** EXCLUDE! **********")
            assert False

        for name, page in analyzed['byExpPage'].items():
            print(':'.join((name, page['condition'], page['finalText'])))

        print()

        for k, v in analyzed['allControlledInputs']:
            if not isinstance(v, str):
                continue
            print(f'{k}: {v}')

        screen_times = [
            (s1['name'], (s2['timestamp'] - s1['timestamp']) / 1000)
            for s1, s2 in toolz.sliding_window(2, analyzed['screenTimes'])
            ]
        c = Counter()
        for name, secs in screen_times:
            c[name] += secs

        total_time = (
            analyzed['screenTimes'][-1]['timestamp']
             - analyzed['screenTimes'][0]['timestamp']) / 1000 / 60
        print(f"\nTotal time: {total_time:.1f}m")
        print('\n'.join('{}: {:.1f}'.format(name, secs) for name, secs in c.most_common()))
