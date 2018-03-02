from . import onmt_model

def handle_request_async(request):
    recs = onmt_model.get_recs(request['sofar'])
    return dict(response=recs)
