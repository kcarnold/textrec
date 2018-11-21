import pandas as pd
import wordfreq
from collections import defaultdict, Counter

from textrec.automated_analyses import nlp
from textrec.paths import paths

trial_level_data = pd.read_csv(
    paths.analyzed / f"combined_data.csv", dtype={"stimulus": str}
)


def dump_specific_POS(wanted_pos = 'ADJ ADV NUM NOUN VERB PROPN'.split()):
    by_word = []
    for idx, row in trial_level_data.loc[:,'experiment participant block idx idx_in_block condition corrected_text'.split()].iterrows():
        row2 = dict(row)
        for token in nlp(row2.pop('corrected_text')):
            if token.pos_ not in wanted_pos:
                continue
            word = token.text
            by_word.append(dict(row2, word=word, zipf_freq=wordfreq.zipf_frequency(word, 'en')))

    pd.DataFrame(by_word).to_csv(paths.data / 'by_word.csv')


def count_words_by_condition(trial_level_data):
    word_counts_by_condition = defaultdict(Counter)
    for idx, row in trial_level_data.loc[:,'condition corrected_text'.split()].iterrows():
        condition = row['condition']
        for token in nlp(row['corrected_text']):
            token = token.text
            word_counts_by_condition[condition][token] += 1
    return word_counts_by_condition

    pd.DataFrame([
        dict(condition=condition, word=word, count=count)
        for condition, counter in word_counts_by_condition.items()
        for word, count in counter.most_common()
    ])

