import json
import traceback
import nltk
import numpy as np
from functools import lru_cache

randomPhrases = """
It tasted like a lot
Shepherd pie and fried chicken
Everything I've ever had on
Haven't tried their tea yet
My fiancee and I tried
It really had no focus
Finally got to go here
Those two slices have made
Some of the other rolls
No matter what I get
It was like eating can
I always knew she was
This place has cool decor
The service starts while you're
You can't even compare this
Never been a pizza hut
I will stick to apps
This place seemed ok and
Just forget about how much
Service is nice with hip"""

randomPhrases = randomPhrases.strip().split("\n")

randomSentences = """
But I guess that's why they serve it all day.
Had the Vietnamese hot coffee (kind of similar to Thai coffee with the condensed milk).
Take for instance the fake plant in the window -- it has never been dusted.
Our group of five was hungry for dinner.
I've been to Cherry Street three times in the last week!
I love chocolate and hazelnut so I'm loving this flavor combination.
I did lose my sake bomb virginity here, which was pretty exciting.
My cousin and I had such a horrible experience.
We had dinner here and quite liked it.
If only all Pittsburgh restaurants could be like you, the world would be a better place.
I would definitely go back to this restaurant.
If you like habatchi style restuarants for a decent price I would recommend this.
When we went to Pisticci, it was for a friend's birthday.
We had lunch here yesterday while attending the Art Festifall.
I have zero complaints with this place and would love to go back.
I was stunned by how big the plate was, but was able to finish nearly the entire portion.
I get it and hope you do too!
Even so we had to wait about 15 - 20 minutes for the hummus to arrive.
Now I know why it's so much cheaper than anything else nearby.
And that's the story of how Hemenay's saved our Valentine's Day!"""

randomSentences = randomSentences.strip().split("\n")


async def handle_request_async(executor, request):
    method = request["method"]
    if method == "get_rec":
        result = await get_keystroke_rec(executor, request)
    elif method == "get_cue":
        result = await get_cue_API(executor, request)
    print("Result:", result)
    return result


@lru_cache()
def get_cueing_data(dataset_name, n_clusters, n_words):
    from . import cueing

    scores_by_cluster_argsort, unique_starts = cueing.cached_scores_by_cluster_argsort(
        dataset_name=dataset_name, n_clusters=n_clusters, n_words=n_words
    )
    return scores_by_cluster_argsort, unique_starts


async def get_cue_API(executor, request):
    recType = request["recType"]

    if recType == "randomPhrases":
        return dict(staticCues=randomPhrases)
    elif recType == "randomSentences":
        return dict(staticCues=randomSentences)

    text = request["text"]
    return {
        "cues": await get_cue(
            executor, text, dataset_name="yelp", n_clusters=20, n_words=5
        )
    }


async def get_cue(executor, text, dataset_name, n_clusters, n_words):
    sents = nltk.sent_tokenize(text)
    scores_by_cluster_argsort, unique_starts = get_cueing_data(
        dataset_name=dataset_name, n_clusters=n_clusters, n_words=n_words
    )
    assert scores_by_cluster_argsort.shape[0] == n_clusters

    # Quick hack.
    rs = np.random.RandomState(len(sents))
    clusters_to_cue = rs.choice(n_clusters, size=3, replace=False)

    cues = []
    for cluster_to_cue in clusters_to_cue:
        # Cue one of the top 10 phrases for this cluster.
        phrase_ids = scores_by_cluster_argsort[cluster_to_cue][:10]
        phrase = unique_starts[rs.choice(phrase_ids)]
        phrase = " ".join(phrase)
        phrase = phrase[0].upper() + phrase[1:]

        cues.append(dict(cluster=int(cluster_to_cue), phrase=phrase))
    return cues


async def get_keystroke_rec(executor, request):
    """
    Generate keystorke recs, with cues at transition points.

    """
    text = request["sofar"]
    sents = nltk.sent_tokenize(text)

    if len(sents) == 0:
        at_transition_point = True
    else:
        last_sentence_ends_in_punct = sents[-1][-1] in ".?!"
        at_transition_point = not last_sentence_ends_in_punct

    if at_transition_point:
        cues = await get_cue(
            executor, text, dataset_name="yelp", n_clusters=20, n_words=5
        )
        return {"cues": cues}

    return {}


async def get_keystroke_rec_onmt(executor, request):
    from . import onmt_model_2

    request_id = request.get("request_id")
    flags = request.get("flags", {})
    prefix = None
    if "cur_word" in request:
        prefix = "".join([ent["letter"] for ent in request["cur_word"]])
    stimulus = request["stimulus"]
    if stimulus["type"] == "doc":
        if stimulus["content"] is None:
            model_name = "cnndm_lm"
            stimulus_content = "."
        else:
            model_name = "cnndm_sum"
            stimulus_content = stimulus["content"]
    elif stimulus["type"] == "img":
        if stimulus["content"] is None:
            model_name = "coco_lm"
            stimulus_content = "."
        else:
            model_name = "coco_cap"
            stimulus_content = str(stimulus["content"])

    in_text = onmt_model_2.tokenize_stimulus(stimulus_content)
    tokens = onmt_model_2.tokenize(request["sofar"])
    try:
        recs = await executor.submit(
            onmt_model_2.get_recs, model_name, in_text, tokens, prefix=prefix
        )
    except Exception:
        traceback.print_exc()
        print("Failing request:", json.dumps(request))
        recs = []

    while len(recs) < 3:
        recs.append(("", None))

    recs_wrapped = [dict(words=[word], meta=None) for word, prob in recs]
    result = dict(predictions=recs_wrapped, request_id=request_id)
    if "threshold" in flags:
        result["show"] = (
            max(prob for word, prob in recs if prob is not None) > flags["threshold"]
        )
    return result
