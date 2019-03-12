import json
import pickle
import re
import traceback
from functools import lru_cache

import nltk
import numpy as np
import wordfreq

from .paths import paths

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

manual_cues = [
    (
        0,
        "seating",
        """
there were plenty of empty
we sat at one of
we were seated by the""",
    ),
    (
        3,
        "ingredients",
        """
        the quality of ingredients is
        the ingredients were fresh and
""",
    ),
    (
        4,
        "location convenience",
        """
    if you live in the
if i lived nearby
""",
    ),
    (6, "decor", """the decor was nice,"""),
    (
        8,
        "alcoholics",
        """
    we had a bottle of
they brew their own beer
they have beer and wine
they also serve beer and
""",
    ),
    (
        9,
        "return?",
        """probably won't be coming back
i won't be going back
this place is a hit
""",
    ),
    (
        12,
        "flavor",
        """
        it has just the right
the flavor was a bit
you can really taste the
when they say spicy ,
it was full of flavor
""",
    ),
    (13, "portions", """the portions are very generous"""),
    (
        14,
        "should-add",
        """i also wish they had
i also wish there was
""",
    ),
    (
        16,
        "sound level",
        """the atmosphere is loud ,
it can get pretty loud
the music was a bit""",
    ),
    (
        21,
        "value",
        """
        for the price you're paying
i don't mind paying a
you get what you pay
for the price , i
however , for the price
""",
    ),
    (
        22,
        "veg/vegan",
        """
    i'm a vegetarian and i
i'm not a vegetarian but
""",
    ),
    (
        31,
        "flavorful/juicy/tender",
        """the meat was flavorful and
the chicken was juicy and
""",
    ),
    (
        33,
        "ambiance/atmosphere",
        """
    the ambiance is really nice
the atmosphere of the place""",
    ),
    (
        37,
        "summary, enjoyed",
        """it's a fun place to
i enjoyed it , but
we sat outside and enjoyed
overall , i enjoyed my""",
    ),
    (40, "payment (credit cards)?", """they do take credit cards"""),
    (
        41,
        "refills",
        """our drinks were never refilled
i had to ask for
if you want a refill
""",
    ),
    (
        43,
        "coming back?",
        """i am definitely coming back
i don't think i'll be""",
    ),
    (
        52,
        "what impressed/not?",
        """i was really impressed by
i was not impressed by
""",
    ),
    (
        53,
        "prior visits?",
        """i frequent this place for
i will be a regular""",
    ),
    (
        59,
        "service",
        """the service was ridiculously slow
it was a little awkward
""",
    ),
    (
        60,
        "occasion",
        """i met a friend here
we went there for dinner
i had dinner here last
i met a friend for""",
    ),
    (
        61,
        "pricey",
        """it's a bit pricey ,
it's a little pricey for
a little on the pricey""",
    ),
    (
        62,
        "companions",
        """my fiance and i went
i came here with my
i took my girlfriend here
my boyfriend and i went
i went there with my
my boyfriend took me here
""",
    ),
    (
        68,
        "disappointment?",
        """you won't be disappointed .
i was disappointed with the
i have never been disappointed
""",
    ),
    (
        70,
        "day of week",
        """we came here on a
it was a saturday night
it was a friday night
""",
    ),
    (
        71,
        "frequency",
        """i've been here multiple times
i've only been here twice
this was my first time
""",
    ),
    (
        72,
        "parking",
        """there is plenty of parking
parking was easy to find
parking is hard to find""",
    ),
    (
        86,
        "wait",
        """it took about 10 minutes
we were in and out
""",
    ),
    (
        87,
        "food tasty?",
        """the food is simple ,
the food is absolutely delicious
""",
    ),
    (
        90,
        "choices, menu selection",
        """there are so many choices
the menu is limited ,
there are so many options
""",
    ),
    (
        101,
        "returning, recommending",
        """wouldn't go out of my
i wouldn't recommend going here
i wouldn't recommend this place""",
    ),
    (
        117,
        "salads/greens?",
        """they also have salads ,
soups , salads , and
""",
    ),
    (
        120,
        "size / appropriate for groups?",
        """
    the place is huge and
we had a large group
the space is small and
""",
    ),
    (
        127,
        "non-alcoholic drinks?",
        """i ordered an iced tea
i ordered an iced coffee
also , the coffee is
""",
    ),
]


def detokenize(x):
    x = re.sub(r"\bi\b", "I", x)
    x = x.replace(" , ", ", ")
    return x[0].upper() + x[1:]


manual_cues = [
    (idx, name, [detokenize(x.strip()) for x in cues.strip().split("\n")])
    for idx, name, cues in manual_cues
]

manual_cues_by_idx = {idx: (name, cues) for idx, name, cues in manual_cues}


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
    dataset_name = 'yelp'
    # cues = await get_cue_auto(
    #    executor, text, dataset_name="yelp", n_clusters=20, n_words=5
    # )
    cues = get_cue(text, dataset_name=dataset_name)
    return {"cues": cues}


def get_cue(text, dataset_name):
    clusters_to_cue = get_predicted_cluster(text, dataset_name)

    sents = nltk.sent_tokenize(text)
    rs = np.random.RandomState(len(sents))

    cues = []
    for cluster_to_cue in clusters_to_cue:
        # Cue one of the phrases for this cluster.
        name, phrases = manual_cues_by_idx[cluster_to_cue]
        phrase = phrases[rs.choice(len(phrases))]
        cues.append(dict(cluster=int(cluster_to_cue), phrase=phrase))

    return cues


cluster_prediction_data = pickle.load(open(paths.data / "predict_cluster.pkl", 'rb'))
cluster_idx2id = [0, 3, 4, 8, 9, 12, 13, 14, 16, 21, 22, 31, 33, 37, 41, 43, 52, 53, 59, 60, 61, 62, 68, 70, 71, 72, 86, 87, 90, 101, 117, 120, 127]


# Cribbed from preprocess_yelp.py
def tokenize(text):
    sents = nltk.sent_tokenize(text)
    token_spaced_sents = (
        " ".join(wordfreq.tokenize(sent, "en", include_punctuation=True))
        for sent in sents
    )
    return "\n".join(token_spaced_sents)


def get_predicted_cluster(text, dataset_name):
    assert dataset_name == 'yelp'

    tokenized = tokenize(text)
    vectorizer = cluster_prediction_data['vectorizer']
    sent_idx = np.array([len(tokenized.split('\n'))])
    X = np.append(vectorizer.transform([tokenized]).A, sent_idx[:, None], axis=1)
    probas = cluster_prediction_data['clf'].predict_proba(X)[0]
    top_clusters = np.argsort(probas)[-3:][::-1]
    return [cluster_idx2id[predicted_cluster] for predicted_cluster in top_clusters]


async def get_cue_auto(executor, text, dataset_name, n_clusters, n_words):
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
