"""
Generate and process human annotations on outcomes.

Corrections: Computes the Damerau–Levenshtein distance between original and corrected text.
"""
import re
import json
import itertools
import pandas as pd
from pyxdameraulevenshtein import damerau_levenshtein_distance
from textrec.paths import paths
from textrec import util
from textrec import automated_analyses

id2url = util.get_coco_id2url()

include_logprobs = True

NON_ALPHA_RE = re.compile(r'[^a-z]')

def edit_distance(x, y):
    x = NON_ALPHA_RE.sub('', x)
    y = NON_ALPHA_RE.sub('', y)
    return damerau_levenshtein_distance(x, y)


def get_corrected_text(trial_level_data):
    trial_level_data['final_text_for_correction'] = trial_level_data['text'].str.replace(re.compile(r'\s+'), ' ')
    result_files = list(paths.gruntwork.glob("corrections_batch*.csv"))
    if result_files:
        correction_results = pd.concat([pd.read_csv(str(f)) for f in result_files], axis=0, ignore_index=True, sort=False)
        if 'stimulus' in correction_results.columns:
            correction_results = correction_results.drop('stimulus', axis=1)
        assert correction_results.columns.tolist() == ['text', 'corrected_text']
        correction_results['final_text_for_correction'] = correction_results['text'].str.replace(re.compile(r'\s+'), ' ')
        correction_results['corrected_text'] = correction_results.corrected_text.apply(lambda s: s.replace('\u2019', "'").lower())
        # The following merge may not be one-to-one because different people may have typed the same description.
        # However, we merge "left" to ensure that each trial retains its unique row.
        trial_level_data = pd.merge(
            trial_level_data, correction_results.drop(['text'], axis=1),
            on='final_text_for_correction', how='left')
    else:
        trial_level_data['corrected_text'] = None


    trial_level_data['uncorrected_errors'] = [
        edit_distance(row.final_text_for_correction, row.corrected_text)
        if isinstance(row.corrected_text, str) else None
        for row in trial_level_data.itertuples()]
    trial_level_data['uncorrected_errors_per_char'] = trial_level_data['uncorrected_errors'] / trial_level_data['num_chars']
    trial_level_data['all_errors'] = trial_level_data['num_tapBackspace'] + trial_level_data['uncorrected_errors']
    corrections_todo = (
        trial_level_data[trial_level_data.corrected_text.isnull()]
        .loc[:,['stimulus', 'final_text_for_correction']].rename(columns=dict(final_text_for_correction='text'))
        .dropna().drop_duplicates())
    corrections_todo['corrected_text'] = None
    if len(corrections_todo) > 0:
        corrections_todo = corrections_todo.groupby('stimulus').apply(lambda group: group.sample(frac=1))

    return trial_level_data, corrections_todo

def dump_data_for_pairwise(batch, trial_level_data):
    all_conditions = list(trial_level_data.condition.unique())
    condition_pairs = list(itertools.combinations(all_conditions, 2))
    items = []
    for _, group in sorted(trial_level_data.loc[:,['idx', 'condition', 'corrected_text', 'stimulus']].groupby('idx')):
        stimuli = group['stimulus'].unique().tolist()
        assert len(stimuli) == 1
        stimulus = stimuli[0]
        group = group.loc[:, ['condition', 'corrected_text']].rename(columns=dict(corrected_text='text'))
        items.append(dict(
            stimulus=stimulus,
            url=id2url[stimulus],
            texts={condition: gg.to_dict(orient='records') for condition, gg in group.groupby('condition')}
        ))
    with open(paths.gruntwork / f'for_pairwise_{batch}.json', 'w') as f:
        json.dump(dict(
            items=items,
            condPairs=condition_pairs), f)


colors = "black white tan grey brown red blue yellow silver blond pink gray blonde beige turquoise orange green teal bluish greenish olive yellowy brownish burgundy blackish aquamarine".split()
color_regex = re.compile(r'\b({})\b'.format('|'.join(colors)))

#desired_pos = 'ADJ ADV NUM NOUN VERB PROPN'.split()
desired_pos = "ADJ ADP ADV CCONJ DET NOUN NUM PART PRON PROPN PUNCT SYM VERB".split()

def get_automated_analysis(datum):
    datum = datum.to_dict()
    text = datum['corrected_text']
    pos_counts = automated_analyses.pos_counts(text)
    for pos in desired_pos:
        datum[f'pos_count_{pos}'] = pos_counts.get(pos, 0)
    datum['num_colors'] = len(color_regex.findall(text))
    datum['mean_log_freq'] = automated_analyses.mean_log_freq(text)
    datum['total_rarity'] = automated_analyses.total_rarity(text)
    if include_logprobs:
        # Note that eval_logprobs_* actually returns the _negative_ logprob.
        datum['logprob_conditional'] = -automated_analyses.eval_logprobs_conditional(datum['stimulus'], text)
        datum['perplexity_per_word_knowing_image'] = 2 ** -datum['logprob_conditional']
        datum['logprob_unconditional'] = -automated_analyses.eval_logprobs_unconditional(text)
        datum['perplexity_per_word_blind_to_image'] = 2 ** -datum['logprob_unconditional']
    for k, v in automated_analyses.all_taps_to_type(datum['stimulus'], text, prefix="corrected_").items():
        datum[k] = v
    datum['corrected_tapstotype_cond'] = datum[f'corrected_tapstotype_{datum["condition"]}']
    datum['corrected_efficiency'] = datum['corrected_tapstotype_cond'] / datum['num_taps']

    datum['ideal_taps_per_word_corrected'] = datum['corrected_tapstotype_standard'] / datum['num_words']
    return pd.Series(datum)

def main(batch):
    trial_level_data = pd.read_csv(paths.analyzed / f'trial_{batch}.csv')
    trial_level_data, corrections_todo = get_corrected_text(trial_level_data)
    corrections_todo_path = paths.gruntwork / f'corrections_todo_{batch}.csv'
    corrections_todo.to_csv(corrections_todo_path, index=False)
    if len(corrections_todo):
        print(f"There are {len(corrections_todo)} corrections to make.")
        print(f"Open {corrections_todo_path} in Excel, Copy to Word -> correct all typos and obvious misspellings.")
        print(f"Copy the result back to Excel, save the result as {paths.gruntwork / 'correction_batch_N.csv'}, IN UTF-8")
    else:
        trial_level_data = trial_level_data.apply(get_automated_analysis, axis=1)


    trial_level_data.to_csv(paths.analyzed / f'trial_withmanual_{batch}.csv', index=False)
    # dump_data_for_pairwise(batch, trial_level_data)

if __name__ == '__main__':
    import argparse
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('batch')
    opts = parser.parse_args()
    main(opts.batch)
