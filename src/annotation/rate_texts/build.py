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
parser.add_argument('batch')
opts = parser.parse_args()
batch = opts.batch

datafile_name = paths.data / "analyzed" / "idea" / batch / "annotation_chunks.json"
data = json.load(open(datafile_name))

# with open(datafile_name, 'w') as f:
#     f.write('var DATA = ')
#     f.write(data)
#     f.write(';\n')
print(len(data), "chunks")

t = Template('''
{% for css in stylesheets %}
<link rel="stylesheet" href="{{css}}">
{% endfor %}
{% raw %}
<div id="app">Loading the task content, please wait...</div>
<p>We&#39;re still refining this HIT, so we&#39;d appreciate your feedback: are the instructions clear? How long did it actually take you? Is the payment fair? Any technical difficulties? Anything else?</p>
<textarea cols="80" name="feedback" placeholder="totally optional feedback" rows="4"></textarea>
{% endraw %}

<script>var chunk_idx = ${chunk_idx};</script>
{% for js in scripts %}
<script src="{{js}}"></script>
{% endfor %}
''')


product = 'comparison'
out_dir = pathlib.Path(f'./deploy/rate_texts')
out_dir.mkdir(exist_ok=True, parents=True)

scripts = list(pathlib.Path('dist/js').glob('*.js'))
scripts.sort(key=lambda name: 1 if name.name.startswith('app') else 0)
scripts.insert(0, datafile_name)
for name in scripts:
    shutil.copyfile(name, out_dir / name.name)
scripts = [f'https://s3.amazonaws.com/megacomplete.net/{product}/{name.name}' for name in scripts]

stylesheets = list(pathlib.Path('dist/css').glob('*.css'))
for name in stylesheets:
    shutil.copyfile(name, out_dir / name.name)
stylesheets = [f'https://s3.amazonaws.com/megacomplete.net/{product}/{name.name}' for name in stylesheets]
prod_html = t.render(scripts=scripts, stylesheets=stylesheets)

input("About to copy prod to clipboard")
subprocess.Popen('pbcopy', stdin=subprocess.PIPE).communicate(prod_html.encode('utf-8'))

print("Syncing to s3")
subprocess.run(['aws', '--profile', 'kca-s3', 's3', 'sync', str(out_dir), f"s3://megacomplete.net/{product}/", '--acl', 'public-read'])
