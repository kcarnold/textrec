import pandas as pd
from .paths import paths
from . import analysis_util
from . import automated_analyses
from collections import Counter
import toolz

NUM_LIKERT_DEGREES_FOR_TRAITS = 5


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
    for participant_id in participants:
        print()
        print(participant_id)
        analyzed = analysis_util.get_log_analysis(participant_id)

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


def count_actions(actions):
    action_counts = dict(
        Counter(toolz.pluck('annoType', actions)))
    action_counts.pop('backendReply', None)
    action_counts = {
        f'num_{typ}': count
        for typ, count in action_counts.items()
    }
    action_counts['num_tapSugg_any'] = sum(
        v for k, v in action_counts.items()
        if k.startswith('num_tapSugg'))
    return action_counts


def compute_speeds(page_data):
    typing_timestamps = [
        action['jsTimestamp'] / 1000
        for action in page_data['actions']
        if action['type'].startswith('tap')]
    seconds_spent_typing = typing_timestamps[-1] - typing_timestamps[0]
    return dict(
        delay_before_start=typing_timestamps[0] - (page_data['firstEventTimestamp'] / 1000),
        num_taps=len(typing_timestamps),
        seconds_spent_typing=seconds_spent_typing,
        taps_per_second=len(typing_timestamps) / seconds_spent_typing,
        characters_per_sec=len(page_data['finalText']) / seconds_spent_typing,
    )


def get_trial_data(participants):
    results = []
    for participant_id in participants:
        analyzed = analysis_util.get_log_analysis(participant_id)

        controlledInputsDict = dict(analyzed['allControlledInputs'])
        if controlledInputsDict.get('shouldExclude', "No") == "Yes":
            print("****** EXCLUDE! **********")
            assert False

        trial_idx = 0
        for name in analyzed['pageSeq']:
            if not name.startswith('final'):
                continue
            page = analyzed['byExpPage'][name]

            block, idx = name.split('-')[1:]
            text = page['finalText'].strip()
            stimulus = page.get('stimulus', {}).get('content')
            data = dict(
                participant=participant_id,
                block=int(block),
                idx_in_block=int(idx),
                idx=trial_idx,
                condition=page['condition'],
                text=text,
                stimulus=stimulus,
                text_len=len(text),
                num_adj=automated_analyses.count_adj(text),
                logprob_conditional=automated_analyses.eval_logprobs_conditional(stimulus, text),
                logprob_unconditional=automated_analyses.eval_logprobs_unconditional(text),
            )

            data.update(count_actions(page['actions']))
            data.update(compute_speeds(page))

            results.append(data)

            trial_idx += 1

    return results


def get_survey_data(participants):
    block_level = []
    experiment_level = []

    for participant_id in participants:
        analyzed = analysis_util.get_log_analysis(participant_id)
        survey_data = dict(analyzed['allControlledInputs'])
        conditions = [analyzed['byExpPage'][page]['condition'] for page in analyzed['pageSeq']]
        assert len(conditions) == 12
        conditions = conditions[::4]
        assert len(set(conditions)) == 3


        for k, v in analyzed['allControlledInputs']:
            segment, rest = k.split('-', 1)
            if segment == 'intro':
                experiment_level.append((participant_id, rest, v))
            elif segment == 'postTask':
                block, rest = rest.split('-', 1)
                block = int(block)
                if ' ' in rest:
                    # Traits, TODO
                    experiment_level.append((participant_id, rest, v))
                else:
                    condition = conditions[block]
                    block_level.append((participant_id, block, condition, rest, v))
            elif segment == 'postExp':
                if rest == 'age':
                    v = int(v)
                if rest.startswith('helpfulRank'):
                    # Decode which keyboard they're talking about
                    assert v.startswith('Keyboard Design ')
                    condition_idx = int(v[-1]) - 1
                    experiment_level.append((participant_id, f'{rest}-idx', condition_idx))
                    experiment_level.append((participant_id, f'{rest}-condition', conditions[condition_idx]))
                else:
                    experiment_level.append((participant_id, rest, v))

    return (
        pd.DataFrame(block_level, columns='participant block condition name value'.split()),
        pd.DataFrame(experiment_level, columns='participant name value'.split()))


def decode_experiment_level(experiment_level):
    experiment_level_pivot = experiment_level.pivot(
        index='participant', columns='name', values='value')

    # "Which is most helpful?"
    helpful_ranks = experiment_level_pivot[[col for col in experiment_level_pivot.columns if col.startswith('helpfulRank')]]
    helpful_ranks = helpful_ranks.rename(columns={col: col[len('helpfulRank-'):] for col in helpful_ranks.columns})

    helpful_ranks_by_condition = helpful_ranks[[col for col in helpful_ranks.columns if col.endswith('condition')]].apply(pd.value_counts).loc[['norecs', 'general', 'specific']]
    helpful_ranks_by_idx = helpful_ranks[[col for col in helpful_ranks.columns if col.endswith('idx')]].apply(pd.value_counts)

    import json
    trait_data = json.load(open(paths.data / 'trait_data.json'))

    for trait, items in toolz.groupby('trait', trait_data).items():
        experiment_level_pivot[trait] = sum(
            (-1 if item['is_negated'] else 1) * pd.to_numeric(experiment_level_pivot[item['item']])
            for item in items
        ) / (NUM_LIKERT_DEGREES_FOR_TRAITS * len(items))


    experiment_level_pivot = experiment_level_pivot.drop([datum['item'] for datum in trait_data], axis=1)

    return dict(
        experiment_level=experiment_level_pivot,
        helpful_ranks_by_condition=helpful_ranks_by_condition,
        helpful_ranks_by_idx=helpful_ranks_by_idx)


def decode_block_level(block_level):
    block_level_pivot = block_level.set_index(['participant', 'block', 'condition', 'name']).value.unstack(-1)
    tlx_columns = 'mental physical temporal performance effort frustration'.split()
    block_level_pivot[tlx_columns] = block_level_pivot[tlx_columns].apply(pd.to_numeric)
    block_level_pivot['TLX_sum'] = sum(
        block_level_pivot[component] for component in tlx_columns)
    return block_level_pivot


def clean_merge(*a, must_match=[], combine_cols=[], **kw):
    res = pd.merge(*a, **kw)
    unclean = [col for col in res.columns if col.endswith('_x') or col.endswith('_y')]
    assert len(unclean) == 0, unclean
    assert 'index' not in res
    return res


def analyze_all(participants):
    trial_data = get_trial_data(participants)

    # I had the wrong URL for one image when one person ran it.
    # trial_data = [trial for trial in trial_data if not (trial['stimulus'] == 431140 and trial['participant'] == 'h52x67')]
    trial_data = [trial for trial in trial_data if not trial['participant'] == 'h52x67']

    # Apply exclusions
    for trial in trial_data:
        trial['used_any_suggs'] = trial['num_tapSugg_any'] != 0
        if trial['condition'] == 'norecs':
            assert not trial['used_any_suggs']

    print("Randomization counts")
    print(
        pd.DataFrame([(k, ','.join(list(toolz.pluck('condition', v))[::4])) for k,v in toolz.groupby('participant', trial_data).items()],
             columns='participant conditions'.split()).conditions.value_counts())

    # Get survey data
    _block_level, _experiment_level = get_survey_data(participants)
    block_level = decode_block_level(_block_level)
    result = decode_experiment_level(_experiment_level)

    result['block_level'] = pd.merge(
        result['experiment_level'].reset_index(),
        block_level.reset_index(),
        on='participant',
        suffixes=('_exp', '_block'),
        validate='1:m')

    result['trial_level'] = pd.merge(
        result['block_level'],
        pd.DataFrame(trial_data),
        on=('participant', 'block', 'condition'),
        suffixes=('_block', '_trial'),
        validate='1:m')

    return result
