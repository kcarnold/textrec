import os
import pickle
from contextlib import contextmanager

import matplotlib.pyplot as plt
import numpy as np
import scipy
from sklearn.metrics import auc, roc_curve

from textrec.paths import paths


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


with open(paths.data / "gating_threshold_data.pkl", "rb") as f:
    data = pickle.load(f)
    cap_data = data['cap_data']
    lm_data = data['lm_data']

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

with fig("roc_cap"):
    plot_rocs(get_rocs(*cap_data))

with fig("roc_lm"):
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

print('fpr:', scipy.interp([.5], trigger_rate, fpr)[0])

# scipy.interp([.1, .9], rocs['max']['fpr'], rocs['max']['thresholds'])
