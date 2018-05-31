import json
import traceback
from . import onmt_model_2


def handle_request_async(request):
    request_id = request.get('request_id')
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
        recs = onmt_model_2.get_recs(model_name, in_text, tokens, prefix=prefix)
    except Exception:
        traceback.print_exc()
        print("Failing request:", json.dumps(request))
        recs = []
    recs_wrapped = [dict(words=[word], meta=None) for word, prob in recs]
    return dict(predictions=recs_wrapped, request_id=request_id)
