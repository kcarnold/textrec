import json

import numpy as np
import scipy.sparse
import toolz
from sklearn.feature_extraction.text import TfidfVectorizer

from textrec.util import get_coco_captions, get_coco_id2url
from textrec.paths import paths

print("Loading captions", flush=True)
images = get_coco_captions()
images_by_split = toolz.groupby('split', images)
valid_images = images_by_split['val']

def img_analyzer(image):
    return [tok for sent in image['sentences'] for tok in sent['tokens']]

print("Vectorizing", flush=True)
vectorizer = TfidfVectorizer(analyzer=img_analyzer, min_df=5)
vectorizer.fit(images)
valid_img_by_word = vectorizer.transform(images_by_split['val'])

def get_most_similar_unique_pairs(sim_matrix_coo, num_pairs):
    similar_pairs = []
    used_images = set()
    for data_idx in np.argsort(sim_matrix_coo.data)[::-1]:
        a = sim_matrix_coo.row[data_idx]
        b = sim_matrix_coo.col[data_idx]
        if a in used_images or b in used_images:
            continue
        used_images.add(a)
        used_images.add(b)
        similar_pairs.append((a, b))
        if len(similar_pairs) == num_pairs:
            break
    return similar_pairs


def get_stimulus_images():
    sim_matrix_coo = scipy.sparse.triu(valid_img_by_word.dot(valid_img_by_word.T), 1).tocoo()
    similar_pairs = list(map(list, get_most_similar_unique_pairs(sim_matrix_coo, 12)))
    rs = np.random.RandomState(0)
    rs.shuffle(similar_pairs)
    for pair in similar_pairs:
        rs.shuffle(pair)
    return similar_pairs

print("Getting similar unique pairs", flush=True)
stimuli = get_stimulus_images()

print("Getting id2url", flush=True)
id2url = get_coco_id2url()

def img_to_json(img):
    cocoid = img['cocoid']
    return dict(
        id=cocoid,
        url=id2url[cocoid])


stimulus_data = [[img_to_json(valid_images[i]) for i in pair] for pair in stimuli]

with open(paths.data / 'stimulusPairs.json', 'w') as out:
    json.dump(stimulus_data, out)

with open(paths.frontend / 'src' / 'stimulusPairs.js', 'w') as out:
    export_name = 'stimulusPairs'
    out.write(f"// AUTO-GENERATED\nexport const {export_name} = ")
    json.dump(stimulus_data, out, indent=2)
    out.write(f";\nexport default {export_name};\n")
