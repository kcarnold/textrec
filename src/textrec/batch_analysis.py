from .paths import paths

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

        for name, page in analyzed['byExpPage'].items():
            print(':'.join((name, page['condition'], page['finalText'])))

        for k, v in analyzed['allControlledInputs']:
            if not isinstance(v, str):
                continue
            print(f'{k}: {v}')
