import gzip
import json
import glob
import tqdm

results = []
for path in tqdm.tqdm(glob.glob('stream*.jsonl.gz')):
    with gzip.open(path) as f:
        article = json.loads(ln)
        del article['content']
        results.append(article)

