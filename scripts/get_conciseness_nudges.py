import pandas as pd
import wordfreq
from tqdm import tqdm, trange

from textrec import onmt_model_2
from textrec.paths import paths
from textrec.automated_analyses import nlp


def get_recs_cap(cocoid, context, prefix=None):
    return onmt_model_2.get_recs("coco_cap", str(cocoid), context, prefix=prefix)


def get_recs_lm(cocoid, context, prefix=None):
    return onmt_model_2.get_recs("coco_lm", ".", context, prefix=prefix)


trial_level_data = pd.read_csv(
    paths.analyzed / f"combined_data.csv", dtype={"stimulus": str}
)


skips = []
for idx in trange(len(trial_level_data)):
    stimulus = trial_level_data.stimulus.iloc[idx]
    text = trial_level_data.corrected_text.iloc[idx]
    text_without_punct = text.replace(".", "").replace(",", "")
    tokens = text_without_punct.split()
    spacy_doc = nlp(text_without_punct)
    for condition in ["contextual", "standard"]:
        get_recs = get_recs_lm if condition == "standard" else get_recs_cap
        for i in range(len(tokens) - 1):
            context = tokens[:i]
            next_word = tokens[i]
            after_next_word = tokens[i + 1]
            recs = get_recs(stimulus, context)
            rec_words = [word for word, prob in recs]
            max_prob = max(prob for word, prob in recs if prob is not None)

            if after_next_word in rec_words:
                skipped_word_freq = wordfreq.zipf_frequency(next_word, "en")
                if len(spacy_doc) == len(tokens):
                    skipped_word_pos = spacy_doc[i].pos_
                else:
                    skipped_word_pos = None
                skips.append(
                    dict(
                        rec_condition=condition,
                        stimulus=stimulus,
                        text=text,
                        word_idx=i,
                        max_prob=max_prob,
                        context_word=context[-1] if i > 0 else "",
                        skipped_word=next_word,
                        skipped_to=after_next_word,
                        next_word_also_reced=next_word in rec_words,
                        skipped_word_freq=skipped_word_freq,
                        skipped_word_pos=skipped_word_pos,
                    )
                )
