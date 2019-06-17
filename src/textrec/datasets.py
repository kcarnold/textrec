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
from .paths import paths

paths_by_name = dict(
    yelp="Yelp/yelp_academic_dataset.json.gz",
    imdb="Reviews/IMDB/Maas2011/aclImdb.zip",
    bios="biosbias/BIOS.pkl",
    newsroom="Newsroom-Dataset/train.jsonl.gz",
    wikivoyage="WikiVoyage/wikivoyage-pages.xml.bz2",
    wikipedia_category="Wikipedia/by_category",
)

WIKITEXT_TITLE_RE = re.compile(r"^[=]+.+[=]+$", re.MULTILINE)
bold_italic = re.compile(r"'''''(.*?)'''''")
bold = re.compile(r"'''(.*?)'''")
italic_quote = re.compile(r"''\"([^\"]*?)\"''")
italic = re.compile(r"''(.*?)''")
quote_quote = re.compile(r'""([^"]*?)""')


def get_path(name, data_root=None):
    if data_root is None:
        data_root = paths.dataset_root
    return data_root / paths_by_name[name]


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


def load_yelp(path=None):
    if path is None:
        path = get_path("yelp")
    data = join_yelp(load_yelp_raw(path=path))
    return data.rename(columns={"review_id": "doc_id"})


def load_imdb(path=None):
    if path is None:
        path = get_path("imdb")

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


def load_bios(path=None):
    if path is None:
        path = get_path("bios")
    with open(path, "rb") as f:
        bios = pickle.load(f)
    print(f"Loaded {len(bios)} bios")

    texts = [bio["raw"] for bio in bios]
    return add_useless_doc_id(pd.DataFrame(dict(text=texts)))


def load_newsroom(*, path=None, frac=0.05, random_state=0):
    if path is None:
        path = get_path("newsroom")
    data = []

    columns = ("title", "url", "text", "summary")

    with gzip.open(path) as f:
        for ln in tqdm.tqdm(f, desc="Loading", total=1_000_000):
            obj = json.loads(ln)
            data.append([obj[k] for k in columns])

    return add_useless_doc_id(
        pd.DataFrame(data, columns=columns).sample(frac=frac, random_state=random_state)
    )


def clean_wikitext(text, only_intro_section=True):
    """
    Extract plain text from Wiki markup.

    If `only_intro_section`, keep only the first section (until the first 
    section header).
    """
    import gensim.corpora.wikicorpus

    text = gensim.corpora.wikicorpus.filter_wiki(text)
    text = text.strip()
    if only_intro_section:
        match = WIKITEXT_TITLE_RE.search(text)
        if match is not None:
            text = text[: match.start()]
    else:
        text = WIKITEXT_TITLE_RE.sub("", text)

    text = bold_italic.sub(r"\1", text)
    text = bold.sub(r"\1", text)
    text = italic_quote.sub(r'"\1"', text)
    text = italic.sub(r'"\1"', text)
    text = quote_quote.sub(r'"\1"', text)
    return text.strip()


def dedupe_dataset(df):
    """
    Sometimes it seems that the wikipedia dump dumps the same article several times.

    In the cases I've noticed, the titles are identical.
    """
    df_dedup = df.drop_duplicates(subset="title")
    n_dupes = len(df) - len(df_dedup)
    print(f"{len(df_dedup)} docs after removing {n_dupes} dupes")
    return df_dedup


def load_wikivoyage(path=None):
    if path is None:
        path = get_path("wikivoyage")
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
        (title, clean_wikitext(text), pageid)
        for title, text, pageid in tqdm.tqdm(pages, desc="Filter Wikitext")
    ]

    data = [[title, text] for title, text, pageid in pages]

    df = pd.DataFrame(data, columns=["title", "text"])
    return add_useless_doc_id(dedupe_dataset(df))


def articles_in_category(category, path=None):
    if path is None:
        path = get_path("wikipedia_category")

    fname = path / f"{category}.jsonl.gz"

    with gzip.open(str(fname)) as f:
        for line in tqdm.tqdm(f, mininterval=1, desc="Read file"):
            article = json.loads(line)
            yield article["name"], article["content"]


def get_wikipedia_category_loader(category):
    def load_wikipedia_category(path=None):
        data = []
        for title, wikitext in articles_in_category(category, path=path):
            text = clean_wikitext(wikitext)
            data.append((title, text))

        return add_useless_doc_id(
            dedupe_dataset(pd.DataFrame(data, columns=["title", "text"]))
        )

    return load_wikipedia_category
