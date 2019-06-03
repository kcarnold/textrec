import glob
import gzip
import json

import pandas as pd
import tqdm

results = []
for path in tqdm.tqdm(glob.glob("stream*.jsonl.gz")):
    with gzip.open(path) as f:
        for line in tqdm.tqdm(f, mininterval=5):
            article = json.loads(line)
            del article["content"]
            results.append(article)

category_memberships = []
for article in results:
    for category_name in article["infoboxes"]:
        category_memberships.append((article["name"], category_name))

category_memberships = pd.DataFrame(category_memberships)
