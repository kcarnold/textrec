# from . import onmt_model
from . import onmt_model_2

from nltk.tokenize.moses import MosesTokenizer
mtokenizer = MosesTokenizer()

def tokenize(text):
    return mtokenizer.tokenize(text)

encoder_states = {}
def get_encoder_state(model_name_and_stimulus):
    if model_name_and_stimulus not in encoder_states:
        model_name, stimulus = model_name_and_stimulus
        tokenized = ' '.join(tokenize(stimulus))
        encoder_state = onmt_model_2.models[model_name].encode(tokenized)
        encoder_states[model_name_and_stimulus] = encoder_state
    return encoder_states[model_name_and_stimulus]


def handle_request_async(request):
    request_id = request.get('request_id')
    prefix = None
    if 'cur_word' in request:
        prefix = ''.join([ent['letter'] for ent in request['cur_word']])
    stimulus = request.get('stimulus')
    if stimulus['type'] == 'doc':
        if stimulus['content'] is None:
            model_name = 'cnndm_lm'
            stimulus_content = '.'
        else:
            model_name = 'cnndm_sum'
            stimulus_content = stimulus['content']
    elif stimulus['type'] == 'img':
        if False:
            model_name = 'coco_lm'
            stimulus_content = '.'
        else:
            model_name = 'coco_cap'
            stimulus_content = '5'

    encoder_state = get_encoder_state((model_name, stimulus_content))
    tokens = tokenize(request['sofar'])
    recs = onmt_model_2.get_recs(model_name, encoder_state, tokens, prefix=prefix)
    recs_wrapped = [dict(words=[word], meta=None) for word in recs]
    return dict(predictions=recs_wrapped, request_id=request_id)
