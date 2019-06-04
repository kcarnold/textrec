# Example run:
# %run scripts/extract_wikipedia_texts.py --stream_glob="/n/home10/kcarnold/scratch/Wikipedia-proc/stream\*.jsonl.gz" --outdir by_infobox --desired_categories="settlement,musical artist,company,film,book,television"
import argparse
import glob
import gzip
import json
import pathlib

import tqdm

parser = argparse.ArgumentParser()
parser.add_argument("--stream_glob", type=str)
parser.add_argument("--desired_categories", type=str)
parser.add_argument("--outdir", type=str)
opts = parser.parse_args()

out_path = pathlib.Path(opts.outdir)


def sanitize_name(name):
    return name.replace("/", "_")


desired_categories = set(opts.desired_categories.split(","))

category_filehandles = {
    category_name: open(out_path / f"{category_name}.jsonl", "w")
    for category_name in desired_categories
}


for path in tqdm.tqdm(glob.glob(opts.stream_glob)):
    with gzip.open(path) as f:
        for line in tqdm.tqdm(f, mininterval=5):
            article = json.loads(line)
            for category_name in article["infoboxes"]:
                if category_name in desired_categories:
                    category_filehandles[category_name].write(
                        json.dumps(article) + "\n"
                    )

for fh in category_filehandles.values():
    fh.close()
