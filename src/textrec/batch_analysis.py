import pandas as pd
from .paths import paths
from . import analysis_util
from . import automated_analyses
from collections import Counter
import toolz

NUM_LIKERT_DEGREES_FOR_TRAITS = 5

class ColType:
    def __init__(self, type, **flags):
        self.type = type
        self.flags = flags

Count = ColType(int, fill=0)

columns = {
    'experiment': {
        'participant': str,
        'age': float,
        'english_proficiency': str,
        'gender': str,
        'helpfulRank-accurate-least-condition': str,
        'helpfulRank-accurate-least-idx': int,
        'helpfulRank-accurate-most-condition': str,
        'helpfulRank-accurate-most-idx': int,
        'helpfulRank-quick-least-condition': str,
        'helpfulRank-quick-least-idx': int,
        'helpfulRank-quick-most-condition': str,
        'helpfulRank-quick-most-idx': int,
        'helpfulRank-specific-least-condition': str,
        'helpfulRank-specific-least-idx': int,
        'helpfulRank-specific-most-condition': str,
        'helpfulRank-specific-most-idx': int,
        'other': str,
        'techDiff': str,
        'total_time': float,
        'use_predictive': bool,
        'verbalized_during': bool,
        'NFC': float,
        'Extraversion': float,
    },
    'block': {
        'participant': str,
        'block': int,
        'condition': str,
        'mental': int,
        'physical': int,
        'temporal': int,
        'performance': int,
        'effort': int,
        'frustration': int,
        'TLX_sum': int,
        'sys-accurate': int,
        'sys-fast': int,
        'sys-specific': int,
        'techDiff': str,
        'other': str,
    },
    'trial': {
        'participant': str,
        'block': int,
        'condition': str,
        'idx': int,
        'idx_in_block': int,
        'stimulus': str,
        'text': str,
        'text_len': int,

        # Process
        'num_tapBackspace': Count,
        'num_tapKey': Count,
        'num_tapSugg_any': Count,
        'num_tapSugg_bos': Count,
        'num_tapSugg_full': Count,
        'num_tapSugg_part': Count,
        'num_taps': Count,
        'used_any_suggs': bool,

        'characters_per_sec': float,
        'delay_before_start': float,
        'seconds_spent_typing': float,
        'taps_per_second': float,

        # Automated outcome analysis
        'logprob_conditional': float,
        'logprob_unconditional': float,
        'num_adj': int,
    }
}

def coerce_columns(df, column_types):
    result = df[list(column_types.keys())]
    extra_columns = set(df.columns) - set(column_types.keys())
    assert len(extra_columns) == 0, sorted(extra_columns)
    for column_name, typ in column_types.items():
        if not isinstance(typ, ColType):
            typ = ColType(typ)
        if 'fill' in typ.flags:
            result[column_name] = result[column_name].fillna(typ.flags['fill'])
        result[column_name] = result[column_name].astype(typ.type)
    return result


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


def summarize(participants, incomplete_ok=False):
    for participant_id in participants:
        print()
        print(participant_id)
        analyzed = analysis_util.get_log_analysis(participant_id)

        if not incomplete_ok:
            assert analyzed['isComplete'], f'INCOMPLETE! {participant_id}'

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
    for ignore in 'backendReply resized tapText'.split():
        action_counts.pop(ignore, None)
    typs = ['tapBackspace', 'tapKey', 'tapSugg_any', 'tapSugg_bos', 'tapSugg_full', 'tapSugg_part']
    for typ in typs:
        action_counts.setdefault(typ, 0)
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

        controlledInputsDict = dict(analyzed['allControlledInputs'])
        if controlledInputsDict.get('shouldExclude', "No") == "Yes":
            print("****** EXCLUDE! **********")
            assert False

        total_time = (
            analyzed['screenTimes'][-1]['timestamp']
             - analyzed['screenTimes'][0]['timestamp']) / 1000 / 60
        experiment_level.append((participant_id, 'total_time', total_time))

        survey_data = dict(analyzed['allControlledInputs'])
        conditions = [analyzed['byExpPage'][page]['condition'] for page in analyzed['pageSeq']]
        assert len(conditions) % 3 == 0
        conditions = conditions[::len(conditions) // 3]
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

    helpful_ranks_by_condition = (
        helpful_ranks[[col for col in helpful_ranks.columns if col.endswith('condition')]]
        .apply(pd.value_counts)
        #.loc[['norecs', 'general', 'specific']]
        .fillna(0).astype(int))
    helpful_ranks_by_idx = (
        helpful_ranks[[col for col in helpful_ranks.columns if col.endswith('idx')]]
        .apply(pd.value_counts)
        .fillna(0).astype(int))

    import json
    with open(paths.data / 'trait_data.json') as f:
        trait_data = json.load(f)

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
    result = decode_experiment_level(_experiment_level)
    result['experiment_level'] = coerce_columns(
        result['experiment_level'].reset_index(),
        columns['experiment'])

    block_level = decode_block_level(_block_level)
    block_level = coerce_columns(block_level.reset_index(), columns['block'])

    result['block_level'] = pd.merge(
        result['experiment_level'],
        block_level,
        on='participant',
        suffixes=('_exp', '_block'),
        validate='1:m')

    result['trial_level'] = pd.merge(
        result['block_level'],
        coerce_columns(pd.DataFrame(trial_data), columns['trial']),
        on=('participant', 'block', 'condition'),
        suffixes=('_block', '_trial'),
        validate='1:m')

    return result
