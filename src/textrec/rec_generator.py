import json
import traceback
import nltk
import numpy as np
import asyncio


async def handle_request_async(executor, request):
    method = request['method']
    if method == 'get_rec':
        result = await get_keystroke_rec(executor, request)
    elif method == 'get_cue':
        result = await get_cue(executor, request)
    print("Result:", result)
    return result


async def get_cue(executor, request):
    from .cueing import get_clizer
    clizer = get_clizer()

    text = request['text']
    sents = nltk.sent_tokenize(text)

    n_clusters = clizer.n_clusters
    assert clizer.scores_by_cluster_argsort.shape[0] == n_clusters

    # Quick hack.
    rs = np.random.RandomState(len(sents))
    clusters_to_cue = rs.choice(n_clusters, size=3, replace=False)

    cues = []
    for cluster_to_cue in clusters_to_cue:
        # Cue one of the top 10 phrases for this cluster.
        phrase_ids = clizer.scores_by_cluster_argsort[cluster_to_cue][:10]
        phrase = clizer.unique_starts[rs.choice(phrase_ids)]

        cues.append(dict(cluster=cluster_to_cue, phrase=phrase))

    return {
        'cues:': cues
    }


async def get_keystroke_rec(executor, request):
    from . import onmt_model_2
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
        recs = await executor.submit(
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
        result['show'] = max(prob for word, prob in recs if prob is not None) > flags['threshold']
    return result
