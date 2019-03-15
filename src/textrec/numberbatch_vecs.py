from functools import lru_cache

import attr
import joblib
import numpy as np

from .paths import paths

CNNB_JOBLIB = str(paths.models / "conceptnet-numberbatch-201609-en.joblib")
CNNB_H5 = "/Data/ConceptNetNumberBatch/conceptnet-numberbatch-mini-1706.h5"


@attr.s
class ConceptNetNumberBatch:
    term2id = attr.ib()
    id2term = attr.ib()
    vecs = attr.ib()
    ndim = attr.ib()

    @staticmethod
    def extract_english(h5_filename=CNNB_H5):
        import h5py

        with h5py.File(h5_filename) as f:
            labels = f["mat"]["axis1"].value
            en_labels = [
                lbl[6:].decode("utf8")
                for idx, lbl in enumerate(labels)
                if lbl.startswith(b"/c/en/")
            ]
            en_indices = [
                idx for idx, lbl in enumerate(labels) if lbl.startswith(b"/c/en/")
            ]
            en_vecs = f["mat"]["block0_values"][en_indices]
            vecs = normalize_vecs(en_vecs.astype(float))
            return dict(labels=en_labels, vecs=vecs)

    @classmethod
    def save_joblib(cls):
        joblib.dump(cls.extract_english(), CNNB_JOBLIB)

    @classmethod
    def load(cls, filename=CNNB_JOBLIB):
        data = joblib.load(filename, mmap_mode="r")
        id2term = data["labels"]
        term2id = {term: idx for idx, term in enumerate(id2term)}
        vecs = data["vecs"]
        return cls(vecs=vecs, term2id=term2id, id2term=id2term, ndim=vecs.shape[1])

    def __getitem__(self, item):
        return self.vecs[self.term2id[item]]

    def __contains__(self, item):
        return item in self.term2id


def normalize_vecs(vecs):
    return vecs / (np.linalg.norm(vecs, axis=1, keepdims=True) + 1e-7)


@lru_cache
def get_cnnb():
    return ConceptNetNumberBatch.load()