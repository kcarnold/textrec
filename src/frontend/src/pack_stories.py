import json
import glob

stories = [open(fn).read() for fn in glob.glob('stories/*.txt')]
json.dump(stories, open('stories.json', 'w'))
