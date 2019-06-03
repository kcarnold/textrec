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

for path in tqdm.tqdm(glob.glob(opts.stream_glob)):
    with gzip.open(path) as f:
        for line in tqdm.tqdm(f, mininterval=5):
            article = json.loads(line)
            for category_name in article["infoboxes"]:
                if category_name in desired_categories:
                    path = out_path / category_name
                    path.mkdir(parents=True, exist_ok=True)
                    (path / sanitize_name(article["name"])).write_text(
                        article["content"]
                    )
