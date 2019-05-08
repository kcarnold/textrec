import gzip
import os

import numpy as np
import pandas as pd

from .util import ujson


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


def load_yelp(
    path="~/Data/Yelp/yelp_academic_dataset.json.gz",
    seed=0,
    valid_frac=0.05,
    test_frac=0.05,
):
    data = join_yelp(load_yelp_raw(path=path))

    train_frac = 1 - valid_frac - test_frac
    num_docs = len(data)
    random_state = np.random.RandomState(seed)
    indices = random_state.permutation(num_docs)
    splits = (np.cumsum([train_frac, valid_frac]) * num_docs).astype(int)
    segment_indices = np.split(indices, splits)
    names = ["train", "valid", "test"]
    print(
        ", ".join(
            "{}: {}".format(name, len(indices))
            for name, indices in zip(names, segment_indices)
        )
    )
    train_indices = segment_indices[0]

    train_data = data.iloc[train_indices].reset_index(drop=True)
    return train_data
