import json
import traceback
from . import onmt_model_2


def handle_request_async(executor, request):
    request_id = request.get('request_id')
    flags = request.get('flags', {})
    prefix = None
    if 'cur_word' in request:
        prefix = ''.join([ent['letter'] for ent in request['cur_word']])
    stimulus = request['stimulus']
    if stimulus['type'] == 'doc':
        if stimulus['content'] is None:
            model_name = 'cnndm_lm'
            stimulus_content = '.'
        else:
            model_name = 'cnndm_sum'
            stimulus_content = stimulus['content']
    elif stimulus['type'] == 'img':
        if stimulus['content'] is None:
            model_name = 'coco_lm'
            stimulus_content = '.'
        else:
            model_name = 'coco_cap'
            stimulus_content = str(stimulus['content'])

    in_text = onmt_model_2.tokenize_stimulus(stimulus_content)
    tokens = onmt_model_2.tokenize(request['sofar'])
    try:
        recs = yield executor.submit(
            onmt_model_2.get_recs, model_name, in_text, tokens, prefix=prefix)
    except Exception:
        traceback.print_exc()
        print("Failing request:", json.dumps(request))
        recs = []

    while len(recs) < 3:
        recs.append(('', None))

    recs_wrapped = [dict(words=[word], meta=None) for word, prob in recs]
    result = dict(predictions=recs_wrapped, request_id=request_id)
    if 'threshold' in flags:
        print(recs)
        result['show'] = max(prob for word, prob in recs if prob is not None) > flags['threshold']
    return result
