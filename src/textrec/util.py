import json
import subprocess

import joblib
import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer

from .paths import paths

try:
    import ujson
except ImportError:
    # Slower but still works fine.
    ujson = json


mem = joblib.Memory(str(paths.cache), mmap_mode='r')

def download_zipfile_members(url, name_to_path):
        import zipfile
        import io
        import requests
        r = requests.get(url)

        with zipfile.ZipFile(io.BytesIO(r.content)) as zf:
            for name, path in name_to_path:
                data = zf.read(name)
                with open(path, 'wb') as tgt:
                    tgt.write(data)

def get_coco_captions():
    '''
    Download Karpathy's version of the COCO captions dataset.

    This has the train-test split that is more commonly used in the literature, as well as pre-tokenized captions.
    '''
    dataset_coco_json = paths.data / 'dataset_coco.json'
    if not dataset_coco_json.exists():
        download_zipfile_members(
            'http://cs.stanford.edu/people/karpathy/deepimagesent/caption_datasets.zip',
            [('dataset_coco.json', str(dataset_coco_json))])
    return ujson.load(open(dataset_coco_json))['images']


def get_coco_id2url():
    train_captions_json = paths.data / 'captions_train2017.json'
    val_captions_json = paths.data / 'captions_val2017.json'

    if not train_captions_json.exists():
        download_zipfile_members(
            'http://images.cocodataset.org/annotations/annotations_trainval2017.zip',
            [
                ('annotations/captions_train2017.json', train_captions_json),
                ('annotations/captions_val2017.json', val_captions_json)
            ])
    train_captions = ujson.load(open(train_captions_json))['images']
    val_captions = ujson.load(open(val_captions_json))['images']
    return {img['id']: img['coco_url'] for img in train_captions + val_captions}


def join_captions(image):
    return '\n'.join(' '.join(sent['tokens']) for sent in image['sentences'])

@mem.cache
def get_caption_vectorizer(ngram_range=(1, 1), min_df=5):
    vectorizer = TfidfVectorizer(ngram_range=ngram_range, min_df=min_df)
    images = get_coco_captions()
    joined_captions = [join_captions(image) for image in images]
    vectorizer.fit(joined_captions)
    return vectorizer

@mem.cache
def get_vectorized_captions(*, vectorizer_kwargs={}, split=None):
    images = get_coco_captions()
    if split is not None:
        images = [img for img in images if img['split'] == split]
        assert len(split)
    joined_captions = [join_captions(image) for image in images]
    vectorizer = get_caption_vectorizer(**vectorizer_kwargs)
    return vectorizer, vectorizer.transform(joined_captions)


def write_json(*, data, filename, export_name=None):
    with open(filename, 'w') as out:
        if export_name:
            out.write(f"// AUTO-GENERATED\nexport const {export_name} = ")
        json.dump(data, out, indent=2)
        if export_name:
            out.write(f";\nexport default {export_name};\n")


def dump_kenlm(model_name, tokenized_sentences, **model_args):
    '''
    Dump tokenized sents / docs, one per line,
    to a file that KenLM can read, and build a model with it.
    '''
    with open(paths.models / '{}.txt'.format(model_name), 'w') as f:
        for toks in tokenized_sentences:
            print(toks, file=f)
    estimate_kenlm_model(model_name, **model_args)


def estimate_kenlm_model(model_name, order=5, prune=2):
    model_full_name = str(paths.models / model_name)
    lmplz_args = ['-o', str(order)]
    if prune is not None:
        lmplz_args.append('--prune')
        lmplz_args.append(str(prune))
    lmplz_args.append('--verbose_header')
    with open(model_full_name + '.txt', 'rb') as in_file, open(model_full_name + '.arpa', 'wb') as arpa_file:
        subprocess.run([str(paths.kenlm_bin / 'lmplz')] + lmplz_args, stdin=in_file, stdout=arpa_file)
    subprocess.run([str(paths.kenlm_bin / 'build_binary'), model_full_name + '.arpa', model_full_name + '.kenlm'])


def flatten_dict(x, prefix=''):
    result = {}
    for k, v in x.items():
        if isinstance(v, dict):
            result.update(flatten_dict(v, prefix=prefix + k + '_'))
        else:
            result[prefix + k] = v
    return result


class VecPile:
    """An attribute-accesed collection that asserts that all of its elements have the same length.

    Useful for keeping several collections together, such as vectors with labels, or several different representations of the same data."""

    def __init__(self, **kw):
        for k, v in kw.items():
            setattr(self, k, v)

    @staticmethod
    def get_len(x):
        try:
            return x.shape[0]
        except AttributeError:
            return len(x)

    def __setattr__(self, key, value):
        new_len = self.get_len(value)
        for existing in self.__dict__.values():
            existing_len = self.get_len(existing)
            if existing_len != new_len:
                raise ValueError(
                    f"Dimension mismatch: vecpile has dimension {existing_len} but trying to add a {new_len}"
                )
        self.__dict__[key] = value

    def __len__(self):
        for existing in self.__dict__.values():
            return self.get_len(existing)


def test_vecpile():
    vp = VecPile()
    x = np.zeros(10)
    vp.x = x
    assert vp.x is x
    try:
        raised = False
        vp.y = np.zeros(2)
    except ValueError:
        raised = True
    assert raised

    vp = VecPile(x=x)
    assert vp.x is x

    assert len(vp) == len(x)


test_vecpile()
