from . import onmt_model

from nltk.tokenize.moses import MosesTokenizer
mtokenizer = MosesTokenizer()

def tokenize(text):
    return mtokenizer.tokenize(text)


def handle_request_async(request):
    request_id = request.get('request_id')
    tokens = tokenize(request['sofar'])
    recs = onmt_model.get_recs(tokens)
    recs_wrapped = [dict(words=[word], meta=None) for word in recs]
    return dict(predictions=recs_wrapped, request_id=request_id)
