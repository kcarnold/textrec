import json
import glob
from textrec import rec_generator
import tqdm

# Use the full image data because we've changed what images to use several times.
from textrec.paths import paths
paths.imgdata_h5 = paths.top_level / 'models-aside' / 'feats_by_imgid.h5'

lines = (json.loads(line.strip()) for logfile in glob.glob('logs/*.jsonl') for line in open(logfile))
requests = [line for line in lines if line['type'] == 'rpc']

print(len(requests), 'requests')

filtered_requests = [
    request for request in requests
    if request['request']['rpc'].get('stimulus') is not None
    and isinstance(request['request']['rpc']['stimulus'], dict)]

print(len(filtered_requests), 'filtered')

for request in tqdm.tqdm(filtered_requests):
    rpc = request['request']['rpc']
    rec_generator.handle_request_async(rpc)
