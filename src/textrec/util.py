import joblib
import json
try:
    import ujson
except ImportError:
    # Slower but still works fine.
    ujson = json
from .paths import paths
from sklearn.feature_extraction.text import TfidfVectorizer

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
