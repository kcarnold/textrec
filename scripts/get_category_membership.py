import gzip
import json
import glob
import tqdm

results = []
for path in tqdm.tqdm(glob.glob('stream*.jsonl.gz')):
    with gzip.open(path) as f:
        for line in tqdm.tqdm(f):
            article = json.loads(line)
            del article['content']
            results.append(article)

