import pickle

import numpy as np
import tqdm

from textrec import notebook_util, onmt_model_2
from textrec.paths import paths


# Use full image-data set.
paths.imgdata_h5 = paths.imgdata_h5_all


# Word-at-a-time ROC curve. TODO: character-at-a-time?


def get_contexts(rs, images, n):
    contexts = []
    for i in range(n):
        img_idx = rs.choice(len(images))
        img = images[img_idx]
        sents = img["sentences"]
        sent_idx = rs.choice(len(sents))
        sent = sents[sent_idx]
        toks = sent["tokens"]
        tok_idx = rs.choice(len(toks))
        contexts.append((img_idx, sent_idx, tok_idx))
    return contexts


def collect_classifier_data(contexts, images, get_recs):
    feats = []
    y = []
    for img_idx, sent_idx, tok_idx in tqdm.tqdm(contexts):
        img = images[img_idx]
        sents = img["sentences"]
        sent = sents[sent_idx]
        toks = sent["tokens"]

        true_word = toks[tok_idx]
        context = toks[:tok_idx]
        recs = get_recs(img, context)
        probs = [prob for word, prob in recs]

        feats.append([max(probs), np.mean(probs), min(probs)])
        y.append(true_word in [word for word, prob in recs])
    labeled_feats = dict(zip("max mean min".split(), np.array(feats).T))
    return labeled_feats, y


def get_recs_cap(img, context):
    return onmt_model_2.get_recs("coco_cap", str(img["cocoid"]), context)


def get_recs_lm(img, context):
    return onmt_model_2.get_recs("coco_lm", ".", context)


val_images = notebook_util.images_by_split["val"]

contexts = get_contexts(np.random.RandomState(0), val_images, 1000)

cap_data = collect_classifier_data(contexts, val_images, get_recs_cap)
lm_data = collect_classifier_data(contexts, val_images, get_recs_lm)

pickle.dump(
    dict(cap_data=cap_data, lm_data=lm_data),
    open(paths.data / "gating_threshold_data.pkl", "wb"),
    -1,
)
