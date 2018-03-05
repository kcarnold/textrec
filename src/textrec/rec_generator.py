from . import onmt_model

from nltk.tokenize.moses import MosesTokenizer
mtokenizer = MosesTokenizer()

def tokenize(text):
    return mtokenizer.tokenize(text)

encoder_states = {}
def get_encoder_state(stimulus):
    if stimulus not in encoder_states:
        encoder_states[stimulus] = onmt_model.model.encode([' '.join(tokenize(stimulus))])
    return encoder_states[stimulus]


def handle_request_async(request):
    request_id = request.get('request_id')
    prefix = None
    if 'cur_word' in request:
        prefix = ''.join([ent['letter'] for ent in request['cur_word']])
    encoder_state = get_encoder_state(request['stimulus'])
    tokens = tokenize(request['sofar'])
    recs = onmt_model.get_recs(encoder_state, tokens, prefix=prefix)
    recs_wrapped = [dict(words=[word], meta=None) for word in recs]
    return dict(predictions=recs_wrapped, request_id=request_id)
