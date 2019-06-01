# Some ideas taken from
# https://towardsdatascience.com/wikipedia-data-science-working-with-the-worlds-largest-encyclopedia-c08efbac5f5c


import bz2
import pathlib

import gensim.corpora.wikicorpus
import tqdm

import mwparserfromhell

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
        wiki = mwparserfromhell.parse(content)
        infoboxes = wiki.filter_templates(matches="Infobox ")
        if len(infoboxes) > 0:
            for box in infoboxes:
                cat_name = box.name.strip_code().strip()
                if not cat_name.startswith("Infobox "):
                    continue
                cat_name = cat_name[8:]
                yield cat_name, name, content


def sanitize_name(name):
    return name.replace("/", "_")


for cat_name, name, content in get_infobox_membership(pages):
    path = out_path / sanitize_name(cat_name)
    path.mkdir(parents=True, exist_ok=True)
    (path / (sanitize_name(name) + ".bz2")).write_bytes(
        bz2.compress(content.encode("utf-8"))
    )
