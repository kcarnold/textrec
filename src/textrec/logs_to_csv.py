import numpy as np
import pandas as pd
import scipy.stats
from .paths import paths
from . import analysis_util, automated_analyses
from collections import Counter
import toolz

NUM_LIKERT_DEGREES_FOR_TRAITS = 5

class ColType:
    def __init__(self, type, **flags):
        self.type = type
        self.__dict__.update(flags)
        self.flags = flags

Count = ColType(int, fill=0)

BoxCox = ColType(float, boxcox=True)
TraitColumn = ColType(float, boxcox=True)

columns = {
    'experiment': {
        'participant': str,
        'age': float,
        'english_proficiency': str,
        'gender': ColType(str, lower=True),
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
        'use_predictive': str,
        'verbalized_during': str,
        'condition_order': str,
        'num_trials_where_recs_used': int,
        'rec_use_group': str,
    },
    'block': {
        'participant': str,
        'block': int,
        'condition': str,
        'mental': float,
        'physical': float,
        'temporal': float,
        'performance': float,
        'effort': float,
        'frustration': float,
        'TLX_sum': float,
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
        'num_chars': int,
        'num_words': int,

        # Process
        'num_tapBackspace': Count,
        'num_tapKey': Count,
        'num_tapSugg_any': Count,
        'num_tapSugg_full': Count,
        'num_tapSugg_part': Count,
        'num_taps': Count,
        'used_any_suggs': bool,
        'num_recs_full_seen': Count,
        'num_recs_full_gated': Count,
        'rec_use_full_frac': ColType(float, boxcox=True, bc_shift=1),

        'delay_before_start': BoxCox,
        'seconds_spent_typing': BoxCox,
        'characters_per_sec': ColType(float, f=lambda datum: datum['num_chars'] / datum['seconds_spent_typing'], boxcox=True),
        'taps_per_second': ColType(float, f=lambda datum: datum['num_taps'] / datum['seconds_spent_typing'], boxcox=True),

        'backspaces_per_tap': ColType(float, boxcox=True, bc_shift=1, f=lambda datum: datum['num_tapBackspace'] / datum['num_taps']),
        'backspaces_per_char': ColType(float, boxcox=True, bc_shift=1, f=lambda datum: datum['num_tapBackspace'] / datum['num_chars']),

        'extraneous_inputs': ColType(float, boxcox=True, bc_shift=10, f=lambda datum: datum['num_taps'] - datum['orig_tapstotype_cond']),
        'extraneous_inputs_per_input': ColType(float, boxcox=True, bc_shift=1, f=lambda datum: (datum['num_taps'] - datum['orig_tapstotype_cond']) / datum['num_taps']),
        'extraneous_inputs_per_char': ColType(float, boxcox=True, bc_shift=1, f=lambda datum: (datum['num_taps'] - datum['orig_tapstotype_cond']) / datum['num_chars']),
        'rec_appropriation_rate': ColType(float, boxcox=True, bc_shift=1, f=lambda datum: (datum['num_tapSugg_any'] / datum['orig_idealrecuse_cond']) if datum['orig_idealrecuse_cond'] else np.nan),
    }
}

for _condition in 'general specific norecs always gated cond'.split():
    columns['trial'][f'orig_tapstotype_{_condition}'] = int
    columns['trial'][f'orig_idealrecuse_{_condition}'] = int
    if _condition != 'norecs':
        # These need to be float so that they can be nan for 'cond' when condition is norecs.
        columns['trial'][f'orig_bow_recs_offered_{_condition}'] = float
        columns['trial'][f'orig_bow_recs_idealuse_{_condition}'] = float
del _condition

def coerce_columns(df, column_types):
    result = df.copy()
    column_order = []
    for column_name, typ in column_types.items():
        column_order.append(column_name)
        if not isinstance(typ, ColType):
            typ = ColType(typ)
        if 'f' in typ.flags:
            result[column_name] = result.apply(typ.flags['f'], axis=1)
        if 'fill' in typ.flags:
            result[column_name] = result[column_name].fillna(typ.flags['fill'])
        try:
        result[column_name] = result[column_name].astype(typ.type)
        except ValueError:
            print(column_name, "Failed to coerce.")
            raise
        if 'lower' in typ.flags:
            assert typ.type is str
            result[column_name] = result[column_name].str.lower()
        if 'boxcox' in typ.flags:
            boxcox_name = f'{column_name}_boxcox'
            column_order.append(boxcox_name)
            col_data = result[column_name]
            if 'bc_shift' in typ.flags:
                col_data = col_data + typ.flags['bc_shift']
            if np.min(col_data) <= 0:
                print(f"Failed to BoxCox because {boxcox_name} has non-positive minimum {np.min(col_data)}")
            # ... and fail here:
                result[boxcox_name], _ = scipy.stats.boxcox(col_data)
    extra_columns = set(result.columns) - set(column_order)
    assert len(extra_columns) == 0, sorted(extra_columns)
    return result[column_order]


def get_participants_by_batch():
    participants_by_batch = {}
    with open(paths.data / 'participants.txt') as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith('#'):
                continue
            batch_name, participants = line.split(':', 1)
            participants = participants.strip().split()
            assert len(participants) == len(set(participants))
            participants_by_batch[batch_name] = participants
    return participants_by_batch


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
    action_counts['num_tapSugg_full'] += action_counts.pop('num_tapSugg_bos')
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
                num_chars=len(text),
                num_words=len(text.split())
            )

            action_counts = count_actions(page['actions'])
            data.update(action_counts)
            recs_at_word_starts = [
                rec
                for rec in page['displayedSuggs']
                if rec is not None
                and len(rec['cur_word']) == 0]
            visible_recs_at_word_starts = [
                rec
                for rec in recs_at_word_starts
                if rec['recs'] is not None]
            data['num_recs_full_seen'] = len(visible_recs_at_word_starts)
            data['num_recs_full_gated'] = len(recs_at_word_starts) - len(visible_recs_at_word_starts)
            data['rec_use_full_frac'] = action_counts['num_tapSugg_full'] / data['num_recs_full_seen'] if data['num_recs_full_seen'] else None
            data.update(compute_speeds(page))

            data.update(automated_analyses.all_taps_to_type(data['stimulus'], text, prefix="orig_"))
            for thing in 'tapstotype idealrecuse bow_recs_offered bow_recs_idealuse'.split():
                data[f'orig_{thing}_cond'] = data.get(f'orig_{thing}_{data["condition"]}')

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
                    # Probably a trait.
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


def decode_experiment_level(experiment_level, traits):
    # Unfortunately one of the traits appears twice and complicates this.
    dups = experiment_level.duplicated(['participant', 'name'], keep=False)
    experiment_level = experiment_level[~dups].copy().append(
        experiment_level[dups].groupby(['participant', 'name']).value.agg(
            lambda x: x.astype(float).mean()).reset_index())

    # Now we have an ordinary pivot-table.
    experiment_level_pivot = (
        experiment_level.set_index(['participant', 'name']).value
        .unstack(-1))

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
        trait_items_by_trait = toolz.groupby('trait', trait_data)

    all_trait_items = []
    for trait in traits:
        items = trait_items_by_trait[trait]
        all_trait_items.extend([item['item'] for item in items])
        item_data = []
        for item in items:
            this_col = pd.to_numeric(experiment_level_pivot[item['item']]) / NUM_LIKERT_DEGREES_FOR_TRAITS
            if item['is_negated']:
                this_col = 1 - this_col
            item_data.append(this_col)
        experiment_level_pivot[trait] = sum(item_data) / len(item_data)


    experiment_level_pivot = experiment_level_pivot.drop(all_trait_items, axis=1)

    return dict(
        experiment_level=experiment_level_pivot,
        helpful_ranks_by_condition=helpful_ranks_by_condition.reset_index(),
        helpful_ranks_by_idx=helpful_ranks_by_idx.reset_index())


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


def analyze_all(participants, traits='NFC Extraversion'):
    traits = traits.split()
    expected_experiment_columns = columns['experiment'].copy()
    for trait in traits:
        expected_experiment_columns[trait] = TraitColumn

    trial_data = get_trial_data(participants)

    # I had the wrong URL for one image when one person ran it.
    # trial_data = [trial for trial in trial_data if not (trial['stimulus'] == 431140 and trial['participant'] == 'h52x67')]
    trial_data = [trial for trial in trial_data if not trial['participant'] == 'h52x67']

    # Apply exclusions
    for trial in trial_data:
        trial['used_any_suggs'] = trial['num_tapSugg_any'] != 0
        if trial['condition'] == 'norecs':
            assert not trial['used_any_suggs']

    condition_orders = pd.DataFrame(
        [(k, ','.join(list(toolz.pluck('condition', v))[::4])) for k,v in toolz.groupby('participant', trial_data).items()],
        columns='participant condition_order'.split())
    print("Randomization counts")
    print(condition_orders.condition_order.value_counts())

    # Get survey data
    _block_level, _experiment_level = get_survey_data(participants)
    result = decode_experiment_level(_experiment_level, traits)

    # Pull in all data
    result['experiment_level'] = pd.merge(
        result['experiment_level'].reset_index(),
        condition_orders,
        on='participant', how='left', validate='1:1')

    result['trial_level'] = coerce_columns(pd.DataFrame(trial_data), columns['trial'])

    result['experiment_level'] = pd.merge(
        result['experiment_level'],
        (
            result['trial_level'].groupby('participant').used_any_suggs.sum()
            .to_frame('num_trials_where_recs_used').reset_index()),
        on='participant',
        validate='1:1')

    result['experiment_level']['rec_use_group'] = (
        result['experiment_level']['num_trials_where_recs_used'] >= 7
    ).map({True: 'habitual', False: 'occasional'})

    result['experiment_level'] = coerce_columns(
        result['experiment_level'],
        expected_experiment_columns)

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
        result['trial_level'],
        on=('participant', 'block', 'condition'),
        suffixes=('_block', '_trial'),
        validate='1:m')

    return result


def main(batch):
    participants = get_participants_by_batch()[batch]
    traits = {
        'spec1': 'NFC Extraversion',
        'gc1': 'NFC Extraversion Openness Trust'
    }
    analyses = analyze_all(participants, traits=traits[batch])
    for name, data in analyses.items():
        if name.endswith('_level'):
            name = name[:-len('_level')]
        data.to_csv(paths.data / 'analyzed' / f'{name}_{batch}.csv', index=False)
    

if __name__ == '__main__':
    import argparse
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('batch')
    opts = parser.parse_args()
    main(opts.batch)
