#!/usr/bin/env python

from jinja2 import Template
import pandas as pd
from textrec.paths import paths

example_task = pd.read_csv(paths.data / 'anno-tasks' / 'guesses.csv').task.iloc[0]
product = 'guesses'
t = Template(open('anno.html').read())

def render(dev, task=None):
    if dev:
        css = 'style.css'
        js = 'script.js'
    else:
        css = f'https://s3.amazonaws.com/megacomplete.net/{product}/style.css'
        js = f'https://s3.amazonaws.com/megacomplete.net/{product}/script.js'
        task = '${task}'
    return t.render(dev=dev, css=css, js=js, task=task)

open('anno-dev.html', 'w').write(render(dev=True, task=example_task))

input("About to copy prod to clipboard")
prod_html = render(dev=False)
import subprocess
subprocess.Popen('pbcopy', stdin=subprocess.PIPE).communicate(prod_html.encode('utf-8'))
