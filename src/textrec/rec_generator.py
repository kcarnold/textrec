from . import onmt_model

def handle_request_async(request):
    request_id = request.get('request_id')
    recs = onmt_model.get_recs(request['sofar'])
    recs_wrapped = [dict(words=[word], meta=None) for word in recs]
    return dict(predictions=recs_wrapped, request_id=request_id)
