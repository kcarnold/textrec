#!/usr/bin/env python

import shutil
import json
from jinja2 import Template
import pandas as pd
import subprocess
from textrec.paths import paths
import pathlib

# Run `yarn build` first.

batch = 'gc1'

datafile_name = pathlib.Path(f'./public/for_pairwise_{batch}.js')
data = open(paths.gruntwork / f'for_pairwise_{batch}.json').read()
with open(datafile_name, 'w') as f:
    f.write('var DATA = ')
    f.write(data)
    f.write(';\n')
print(len(json.loads(data)['items']), "items")

t = Template('''
{% for css in stylesheets %}
<link rel="stylesheet" href="{{css}}">
{% endfor %}
{% raw %}
<div id="app">Loading the task content, please wait...</div>
<p>We&#39;re still refining this HIT, so we&#39;d appreciate your feedback: are the instructions clear? How long did it actually take you? Is the payment fair? Any technical difficulties? Anything else?</p>
<textarea cols="80" name="feedback" placeholder="totally optional feedback" rows="4"></textarea>
{% endraw %}

<script>var stimulusIdx = ${stim_idx}, NUM_PAIRS=10;</script>
{% for js in scripts %}
<script src="{{js}}"></script>
{% endfor %}
''')


product = 'comparison'
out_dir = pathlib.Path(f'./deploy/comparison')
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
