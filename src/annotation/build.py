#!/usr/bin/env python

import json
import hashlib
from jinja2 import Template
import pandas as pd
from textrec.paths import paths
import subprocess

example_task = pd.read_csv(paths.data / 'anno-tasks' / 'guesses.csv').task.iloc[0]
product = 'guesses'
t = Template(open('anno.html').read())

def render(dev, task=None):
    vue_template = json.dumps(open('template.html').read())
    css = 'style.css'
    js = 'script.js'
    if not dev:
        def hashed_url(file):
            md5 = hashlib.md5(open(file, 'rb').read()).hexdigest()
            return f'https://s3.amazonaws.com/megacomplete.net/{product}/{md5}-{file}'
        css = hashed_url(css)
        js = hashed_url(js)
        task = '${task}'
    return t.render(dev=dev, css=css, js=js, task=task, template=vue_template)

open('anno-dev.html', 'w').write(render(dev=True, task=example_task))

prod_html = render(dev=False)
input("About to copy prod to clipboard")
subprocess.Popen('pbcopy', stdin=subprocess.PIPE).communicate(prod_html.encode('utf-8'))
