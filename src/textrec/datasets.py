import bz2
import gzip
import json
import os
import pickle
import re
import zipfile

import pandas as pd
import tqdm

from .util import ujson

YELP_PATH = "/Data/Yelp/yelp_academic_dataset.json.gz"
IMDB_PATH = "/Data/Reviews/IMDB/Maas2011/aclImdb.zip"
BIOS_PATH = "/Data/biosbias/BIOS.pkl"
NEWSROOM_PATH = "/Data/Newsroom-Dataset/train.jsonl.gz"
WIKIVOYAGE_PATH = "/Data/WikiVoyage/wikivoyage-pages.xml.bz2"


def add_useless_doc_id(df):
    return df.rename_axis(index="doc_id").reset_index()


def flatten_dict(x, prefix=""):
    result = {}
    for k, v in x.items():
        if isinstance(v, dict):
            result.update(flatten_dict(v, prefix=k + "_"))
        else:
            result[prefix + k] = v
    return result


def load_yelp_raw(path):
    data_types = {x: [] for x in ["review", "business", "user"]}
    with gzip.open(os.path.expanduser(path), "rb") as f:
        for line in f:
            rec = ujson.loads(line.decode("utf8"))
            rec = flatten_dict(rec)
            data_types[rec["type"]].append(rec)
    return data_types


def join_yelp(data):
    reviews = pd.DataFrame(data["review"]).drop(["type"], axis=1)
    businesses = pd.DataFrame(data["business"]).drop(
        ["type", "photo_url", "url", "full_address", "schools"], axis=1
    )
    users = pd.DataFrame(data["user"]).drop(["type", "name", "url"], axis=1)

    restaurants = businesses[
        businesses.open & businesses.categories.apply(lambda x: "Restaurants" in x)
    ]
    restaurants = restaurants.drop(["open"], axis=1)

    result = pd.merge(
        reviews,
        restaurants,
        left_on="business_id",
        right_on="business_id",
        suffixes=("_review", "_biz"),
    )
    result = pd.merge(
        result, users, left_on="user_id", right_on="user_id", suffixes=("", "_user")
    )

    result["date"] = pd.to_datetime(result.date)

    def to_months(time_delta):
        return time_delta.total_seconds() / 3600.0 / 24.0 / 30.0

    result["age_months"] = (result.date.max() - result.date).apply(to_months)
    return result


def load_yelp(*, path=YELP_PATH):
    data = join_yelp(load_yelp_raw(path=path))
    return data.rename(columns={"review_id": "doc_id"})


def load_imdb(path=IMDB_PATH):
    zf = zipfile.ZipFile(path)

    imdb_reviews = []
    for f in zf.filelist:
        match = re.match(
            r"^aclImdb/(?P<subset>train|test)/(?P<group>pos|neg|unsup)/(?P<review_id>\d+)_(?P<rating>\d+)\.txt",
            f.filename,
        )
        if match:
            item = {}
            item["doc_id"] = match.groups()
            item["text"] = zf.read(f.filename).decode("utf-8").replace("<br />", " ")
            imdb_reviews.append(item)

    return pd.DataFrame(imdb_reviews)


def load_bios(path=BIOS_PATH):
    with open(path, "rb") as f:
        bios = pickle.load(f)
    print(f"Loaded {len(bios)} bios")

    texts = [bio["raw"] for bio in bios]
    return add_useless_doc_id(pd.DataFrame(dict(text=texts)))


def load_newsroom(path=NEWSROOM_PATH, frac=0.05, random_state=0):
    data = []

    columns = ("title", "url", "text", "summary")

    with gzip.open(path) as f:
        for ln in tqdm.tqdm(f, desc="Loading", total=1_000_000):
            obj = json.loads(ln)
            data.append([obj[k] for k in columns])

    return add_useless_doc_id(
        pd.DataFrame(data, columns=columns).sample(frac=frac, random_state=random_state)
    )


def load_wikivoyage(path=WIKIVOYAGE_PATH):
    import gensim.corpora.wikicorpus

    filename = os.path.expanduser(path)

    filter_namespaces = ("0",)
    pages = gensim.corpora.wikicorpus.extract_pages(
        bz2.BZ2File(filename), filter_namespaces
    )
    pages = [
        (title, text, pageid)
        for title, text, pageid in tqdm.tqdm(pages, desc="Read file")
        if len(text.split()) > 50
    ]
    pages = [
        (title, gensim.corpora.wikicorpus.filter_wiki(text), pageid)
        for title, text, pageid in tqdm.tqdm(pages, desc="Filter Wikitext")
    ]

    is_title = re.compile(r"^[=]+.+[=]+$", re.MULTILINE)

    data = []

    for title, text, pageid in pages:
        text = is_title.sub("", text)
        data.append([title, text])

    return add_useless_doc_id(pd.DataFrame(data, columns=["title", "text"]))
