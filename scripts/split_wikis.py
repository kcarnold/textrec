# Some ideas taken from
# https://towardsdatascience.com/wikipedia-data-science-working-with-the-worlds-largest-encyclopedia-c08efbac5f5c


import bz2
import pathlib

import gensim.corpora.wikicorpus
import tqdm
import re

# infobox_re = re.compile('{{Infobox (.+)\\n')
infobox_re = re.compile("{{Infobox ([^<|}\n]+)")
data_path = "/Data/Wiki/enwiki-20190520-pages-articles-multistream.xml.bz2"
total_n_pages = 19_414_056
out_path = pathlib.Path("/Data/Wiki/by_infobox")

filter_namespaces = ("0",)
pages = gensim.corpora.wikicorpus.extract_pages(
    bz2.BZ2File(data_path), filter_namespaces
)


def get_infobox_membership(pages):
    for name, content, pageid in tqdm.tqdm(pages, total=total_n_pages):
        if "Infobox " not in content:
            continue
        for cat_name in infobox_re.findall(content):
            cat_name = cat_name.strip()
            yield cat_name, name, content


def sanitize_name(name):
    return name.replace("/", "_")


for cat_name, name, content in get_infobox_membership(pages):
    path = out_path / sanitize_name(cat_name)
    path.mkdir(parents=True, exist_ok=True)
    (path / (sanitize_name(name) + ".bz2")).write_bytes(
        bz2.compress(content.encode("utf-8"))
    )
