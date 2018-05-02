import joblib
import json
from .paths import paths

mem = joblib.Memory(str(paths.cache), mmap_mode='r')

def get_coco_captions():
    '''
    Download Karpathy's version of the COCO captions dataset.

    This has the train-test split that is more commonly used in the literature, as well as pre-tokenized captions.
    '''
    dataset_coco_json = paths.data / 'dataset_coco.json'
    if not dataset_coco_json.exists():
        import zipfile
        import io
        import requests
        r = requests.get('http://cs.stanford.edu/people/karpathy/deepimagesent/caption_datasets.zip')

        with zipfile.ZipFile(io.BytesIO(r.content)) as zf, open(dataset_coco_json, 'wb') as tgt:
            tgt.write(zf.read('dataset_coco.json'))

    return json.load(open(dataset_coco_json))['images']
