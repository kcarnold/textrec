import joblib
import json
from .paths import paths

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
    return json.load(open(dataset_coco_json))['images']


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
    train_captions = json.load(open(train_captions_json))['images']
    val_captions = json.load(open(val_captions_json))['images']
    return {img['id']: img['coco_url'] for img in train_captions + val_captions}
