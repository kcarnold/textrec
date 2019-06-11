#!/usr/bin/env python

import argparse
import json
import pathlib
import shutil
import subprocess

import pandas as pd
from jinja2 import Template

from textrec.paths import paths

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("batch")
parser.add_argument("--truncate", type=int, default=0)
opts = parser.parse_args()
batch = opts.batch

subprocess.run(["make", "dist/App.umd.js"])

datafile_name = paths.data / "analyzed" / "idea" / batch / f"annotation_chunks_{batch}.json"
data = json.load(open(datafile_name))
if opts.truncate != 0:
    data = data[: opts.truncate]

shutil.copyfile(datafile_name, f"public/{datafile_name.name}")

print(len(data), "chunks")

pd.Series(list(range(len(data)))).to_frame("chunk_idx").to_csv(
    paths.top_level / "HITs" / f"chunk_indices_{batch}.csv", index=False
)

t = Template(
    """
<script src="https://unpkg.com/vue"></script>
{% for css in resources.css %}
<link rel="stylesheet" href="{{css}}">
{% endfor %}
{% raw %}
<div id="app">Loading the task content, please wait...</div>
<p>We&#39;re still refining this HIT, so we&#39;d appreciate your feedback: are the instructions clear? How long did it actually take you? Is the payment fair? Any technical difficulties? Anything else?</p>
<textarea cols="80" name="feedback" placeholder="totally optional feedback" rows="4"></textarea>
{% endraw %}

<script>var chunk_idx = ${chunk_idx}, FILE_PATH="{{resources.json[0]}}"</script>
{% for js in resources.js %}
<script src="{{js}}"></script>
{% endfor %}
<script>
document.getElementById('app').innerHTML="<App></App>"
new Vue({
  components: {"App": App}
}).$mount('#app')
</script>
"""
)


product = "rate_texts"
out_dir = pathlib.Path(f"./deploy/rate_texts")
out_dir.mkdir(exist_ok=True, parents=True)

resources = {}

resources["js"] = [pathlib.Path("dist/App.umd.js")]
resources["json"] = [datafile_name]
resources["css"] = list(pathlib.Path("dist").glob("*.css"))


def get_mapped_resources(resources):
    for typ, path_list in resources.items():
        for path in path_list:
            shutil.copyfile(path, out_dir / path.name)

    return {
        typ: [
            f"https://s3.amazonaws.com/megacomplete.net/{product}/{path.name}"
            for path in path_list
        ]
        for typ, path_list in resources.items()
    }


mapped_resources = get_mapped_resources(resources)
prod_html = t.render(resources=mapped_resources)

input("About to copy prod to clipboard")
subprocess.Popen("pbcopy", stdin=subprocess.PIPE).communicate(prod_html.encode("utf-8"))

print("Syncing to s3")
subprocess.run(
    [
        "aws",
        "--profile",
        "kca-s3",
        "s3",
        "sync",
        str(out_dir),
        f"s3://megacomplete.net/{product}/",
        "--acl",
        "public-read",
    ]
)
