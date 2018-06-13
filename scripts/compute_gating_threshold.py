import os
import matplotlib.pyplot as plt
import numpy as np
import scipy
import tqdm

from textrec.paths import paths
from textrec import notebook_util, onmt_model_2
from sklearn.metrics import roc_curve, auc



from contextlib import contextmanager

def figout(filename, figpath=paths.top_level / 'reports' / 'figures'):
    if not os.path.isabs(filename):
        filename = os.path.join(figpath, filename)
    plt.savefig(str(filename)+'.pdf')

@contextmanager
def fig(filename, **kw):
    f = plt.figure()
    yield
    figout(filename, **kw)
    plt.close(f)


# Use full image-data set.
paths.imgdata_h5 = paths.imgdata_h5_all


# Word-at-a-time ROC curve. TODO: character-at-a-time?


def get_contexts(rs, images, n):
    contexts = []
    for i in range(n):
        img_idx = rs.choice(len(images))
        img = images[img_idx]
        sents = img['sentences']
        sent_idx = rs.choice(len(sents))
        sent = sents[sent_idx]
        toks = sent['tokens']
        tok_idx = rs.choice(len(toks))
        contexts.append((img_idx, sent_idx, tok_idx))
    return contexts

def collect_classifier_data(contexts, images, get_recs):
    feats = []
    y = []
    for img_idx, sent_idx, tok_idx in tqdm.tqdm(contexts):
        img = images[img_idx]
        sents = img['sentences']
        sent = sents[sent_idx]
        toks = sent['tokens']

        true_word = toks[tok_idx]
        context = toks[:tok_idx]
        recs = get_recs(img, context)
        probs = [prob for word, prob in recs]

        feats.append([
            max(probs),
            np.mean(probs),
            min(probs)
        ])
        y.append(true_word in [word for word, prob in recs])
    labeled_feats = dict(zip('max mean min'.split(), np.array(feats).T))
    return labeled_feats, y

def get_recs_cap(img, context): return onmt_model_2.get_recs('coco_cap', str(img['cocoid']), context)
def get_recs_lm(img, context): return onmt_model_2.get_recs('coco_lm', '.', context)

val_images = notebook_util.images_by_split['val']

contexts = get_contexts(
    np.random.RandomState(0),
    val_images,
    1000)

cap_data = collect_classifier_data(contexts, val_images, get_recs_cap)
lm_data = collect_classifier_data(contexts, val_images, get_recs_lm)



def get_rocs(labeled_feats, y):
    return {
        k: dict(zip('fpr tpr thresholds'.split(), roc_curve(y, v)))
        for k, v in labeled_feats.items()
    }


def plot_rocs(rocs):
    aucs = {k: auc(roc['fpr'], roc['tpr']) for k, roc in rocs.items()}

    lw = 1
    for name, color in [('max', 'darkorange'), ('mean', 'deeppink'), ('min', 'cornflowerblue')]:
        roc = rocs[name]
        plt.plot(roc['fpr'], roc['tpr'], color=color,
                 lw=lw, label=f'{name} ROC curve (area = {aucs[name]:.02f})')
    plt.plot([0, 1], [0, 1], color='navy', lw=lw, linestyle='--')
    plt.xlim([0.0, 1.0])
    plt.ylim([0.0, 1.05])
    plt.xlabel('False Positive Rate')
    plt.ylabel('True Positive Rate')
    plt.legend(loc="lower right")


def compute_display_rate(labeled_feats, y):
    rocs = get_rocs(labeled_feats, y)
    def get_rate(feats, threshold):
        return np.mean(feats > threshold)
    rates = [get_rate(labeled_feats['max'], threshold) for threshold in rocs['max']['thresholds']]
    rates = np.mean(labeled_feats['max'][:,None] > rocs['max']['thresholds'][None,:], axis=0)
    return rocs['max']['fpr'], rates

with fig("cap_roc"):
    plot_rocs(get_rocs(*cap_data))

with fig("cap_lm"):
    plot_rocs(get_rocs(*lm_data))

with fig("display_rates"):
    plt.plot(*compute_display_rate(*lm_data), label="LM")
    plt.plot(*compute_display_rate(*cap_data), label="Cap")

    plt.xlim([0.0, 1.0])
    plt.xlabel('False Positive Rate')
    plt.ylabel('Trigger rate')
    plt.legend()


fpr, trigger_rate = compute_display_rate(*lm_data)
print("To get trigger rate of 0.5, use threshold")
print(scipy.interp([.5], trigger_rate, get_rocs(*lm_data)['max']['thresholds'])[0])


# scipy.interp([.1, .9], rocs['max']['fpr'], rocs['max']['thresholds'])

