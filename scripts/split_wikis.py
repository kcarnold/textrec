# Some ideas taken from
# https://towardsdatascience.com/wikipedia-data-science-working-with-the-worlds-largest-encyclopedia-c08efbac5f5c


import sys
import json

import gensim.corpora.wikicorpus
import tqdm
import re

infobox_re = re.compile("{{Infobox ([^<|}\n]+)")


def get_infobox_membership(content):
    if "Infobox " not in content:
        return []
    return [cat_name.strip() for cat_name in infobox_re.findall(content)]


def sanitize_name(name):
    return name.replace("/", "_")


pages = gensim.corpora.wikicorpus.extract_pages(
    sys.stdin.buffer, filter_namespaces=("0",)
)

for name, content, pageid in tqdm.tqdm(pages, mininterval=5):
    infoboxes = get_infobox_membership(content)
    if not infoboxes:
        continue
    sys.stdout.write(
        json.dumps(dict(name=name, content=content, infoboxes=infoboxes)) + "\n"
    )
