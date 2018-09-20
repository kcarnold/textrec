import pandas as pd
import wordfreq

from textrec.automated_analyses import nlp
from textrec.paths import paths

trial_level_data = pd.read_csv(
    paths.analyzed / f"combined_data.csv", dtype={"stimulus": str}
)

wanted_pos = 'ADJ ADV NUM NOUN VERB PROPN'.split()
by_word = []
for idx, row in trial_level_data.loc[:,'experiment participant block idx idx_in_block condition corrected_text'.split()].iterrows():
    row2 = dict(row)
    for token in nlp(row2.pop('corrected_text')):
        if token.pos_ not in wanted_pos:
            continue
        word = token.text
        by_word.append(dict(row2, word=word, zipf_freq=wordfreq.zipf_frequency(word, 'en')))

pd.DataFrame(by_word).to_csv('by_word.csv')
