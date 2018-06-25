import re
import json
import itertools
import pandas as pd
from textrec.paths import paths
from textrec import util

id2url = util.get_coco_id2url()


from functools import lru_cache
@lru_cache(maxsize=2**10)
def lev_dist(a, b):
    if not a: return len(b)
    if not b: return len(a)
    
    if a[0] == b[0]:
        return lev_dist(a[1:], b[1:])

    return (
        1 # since first characters differ
        + min(
            lev_dist(a, b[1:]), # insertion
            lev_dist(a[1:], b), # deletion
            lev_dist(a[1:], b[1:]) # substitution
        )
    )


def get_corrected_text(trial_level_data):
    trial_level_data['final_text_for_correction'] = trial_level_data['text'].str.replace(re.compile(r'\s+'), ' ')
    result_files = list(paths.gruntwork.glob("corrections_batch*.csv"))
    if result_files:
        correction_results = pd.concat([pd.read_csv(str(f)) for f in result_files], axis=0, ignore_index=True)
        assert correction_results.columns.tolist() == ['text', 'corrected_text']
        correction_results['final_text_for_correction'] = correction_results['text'].str.replace(re.compile(r'\s+'), ' ')
        correction_results['corrected_text'] = correction_results.corrected_text.apply(lambda s: s.replace('\u2019', "'").lower())
        trial_level_data = pd.merge(
            trial_level_data, correction_results.drop(['text'], axis=1),
            on='final_text_for_correction', how='left', validate='1:1')
    else:
        trial_level_data['corrected_text'] = None


    trial_level_data['uncorrected_errors'] = [lev_dist(row.final_text_for_correction, row.corrected_text) for row in trial_level_data.itertuples()]
    corrections_todo = trial_level_data[trial_level_data.corrected_text.isnull()].final_text_for_correction.dropna().drop_duplicates().to_frame('text')
    corrections_todo['corrected_text'] = None

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


def main(batch):
    trial_level_data = pd.read_csv(paths.analyzed / f'trial_{batch}.csv')
    trial_level_data, corrections_todo = get_corrected_text(trial_level_data)
    corrections_todo_path = paths.gruntwork / 'corrections_todo.csv'
    corrections_todo.to_csv(corrections_todo_path, index=False)
    if len(corrections_todo):
        print("There are corrections to make.")
        print(f"Open {corrections_todo_path} in Excel, Copy to Word -> correct all typos and obvious misspellings.")
        print(f"Copy the result back to Excel, save the result as {paths.gruntwork / 'correction_batch_N.csv'}, IN UTF-8")
    trial_level_data.to_csv(paths.analyzed / f'trial_withmanual_{batch}.csv', index=False)

    dump_data_for_pairwise(batch, trial_level_data)

if __name__ == '__main__':
    import argparse
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('batch')
    opts = parser.parse_args()
    main(opts.batch)
