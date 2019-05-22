import json
import traceback

import nltk
import numpy as np
import wordfreq

from . import cueing

N_CLUSTERS = 128
MIN_CLUSTER_SIZE = 20

PRELOAD_MODELS = [
    "yelp_128",
    "imdb_128",
    #    'bios'
]
PARTS_NEEDED = ["sentences"]


cueing.preload_models(PRELOAD_MODELS, PARTS_NEEDED)


async def handle_request_async(executor, request):
    method = request["method"]
    if method == "get_rec":
        result = await get_keystroke_rec(executor, request)
    elif method == "get_cue":
        result = await get_cue_API(executor, request)
    print("Result:", result)
    return result


domain_to_model = dict(restaurant="yelp_128", movie="imdb_128", bio="bios_128")


async def get_cue_API(executor, request):
    return dict(
        cues=[
            dict(
                text="Error retrieving ideas. This error has been reported; please finish the survey anyway."
            )
        ]
    )
    rec_type = request["recType"]
    domain = request["domain"]

    text = request["text"]
    model_name = domain_to_model[domain]

    if rec_type == "randomSents":
        return get_cue_random(model_name=model_name)
    elif rec_type == "cueSents":
        return get_cue(text, model_name=model_name, mode="example")


def get_cue_random(*, model_name):
    sentences = cueing.get_model(model_name, "sentences")

    cues = [dict(text=sentence) for sentence in sentences.raw_sent.sample(n=10)]
    return dict(cues=cues)


def get_cue(text, *, model_name, n_clusters_to_cue=10, mode):
    existing_clusters, next_cluster_probs = next_cluster_distribution(
        text=text, model_name=model_name, use_sequence_lm=False
    )

    if mode == "cue_phrase":
        # Note that current models don't save these...
        scores_by_cluster_argsort = cueing.get_model(
            model_name, "scores_by_cluster_argsort"
        )
        unique_starts = cueing.get_model(model_name, "unique_starts")

        def get_cue_for_cluster(cluster_to_cue):
            # Cue one of the phrases for this cluster.
            if cluster_to_cue not in scores_by_cluster_argsort:
                # Some clusters were deleted... for now just skip them :(
                return

            phrase_idx = scores_by_cluster_argsort[cluster_to_cue][0]
            phrase = " ".join(unique_starts[phrase_idx])
            return dict(text=phrase)

    elif mode == "example":
        topic_labeled_sentences = cueing.get_model(model_name, "sentences")

        def get_cue_for_cluster(cluster_to_cue):
            cluster_sentences = topic_labeled_sentences[
                topic_labeled_sentences.topic == cluster_to_cue
            ]
            if len(cluster_sentences) > MIN_CLUSTER_SIZE:
                sentence = cluster_sentences.raw_sent.sample(n=1).iloc[0]
                return dict(text=sentence)

    elif mode == "exampleHighlighted":
        labels_and_sents = cueing.get_model(model_name, "labels_and_sents")

        def get_cue_for_cluster(cluster_to_cue):
            if cluster_to_cue not in labels_and_sents:
                return
            label, candidates = labels_and_sents[cluster_to_cue]
            candidate_idx = np.random.choice(len(candidates))
            sentence, label_span = candidates[candidate_idx]
            return dict(text=sentence, highlight_span=label_span)

    else:
        assert False

    clusters_to_cue = np.random.choice(
        len(next_cluster_probs),
        size=len(next_cluster_probs),
        replace=False,
        p=next_cluster_probs,
    )

    cues = []
    for cluster_to_cue in clusters_to_cue:
        cue = get_cue_for_cluster(cluster_to_cue)
        if cue is None:
            continue
        cue["cluster"] = int(cluster_to_cue)

        cues.append(cue)
        if len(cues) == n_clusters_to_cue:
            break

    cued_clusters = [cue["cluster"] for cue in cues]
    print("Cueing", cued_clusters)

    return dict(cues=cues, existing_clusters=existing_clusters.tolist())


# Cribbed from preprocess_yelp.py
def tokenize(text):
    if isinstance(text, list):
        sents = text
    else:
        sents = nltk.sent_tokenize(text)
    token_spaced_sents = (
        " ".join(wordfreq.tokenize(sent, "en", include_punctuation=True))
        for sent in sents
    )
    return "\n".join(token_spaced_sents)


def topic_sequence_logprobs(existing_clusters, model_name):
    seq_model = cueing.get_model(model_name, "topic_sequence_model")
    state, _ = seq_model.get_state(
        " ".join(str(c) for c in existing_clusters), bos=True
    )
    cluster_indices = [seq_model.model.vocab_index(str(n)) for n in range(n_clusters)]
    logprobs = seq_model.eval_logprobs_for_words(state, cluster_indices)
    return logprobs


def next_cluster_distribution(text, model_name, use_sequence_lm):
    tokenized_doc = tokenize(text)
    vectorizer = cueing.get_model(model_name, "vectorizer")
    projection_mat = cueing.get_model(model_name, "projection_mat")
    clusterer = cueing.get_model(model_name, "clusterer")
    n_clusters = clusterer.n_clusters

    sents = tokenized_doc.split("\n")
    vecs = vectorizer.transform(sents)
    projected = vecs.dot(projection_mat)
    existing_clusters = clusterer.predict(projected)

    if use_sequence_lm:
        logprobs = topic_sequence_logprobs(existing_clusters, model_name)
        cluster_probs = np.exp(logprobs)
    else:
        co_occur = cueing.get_model(model_name, "cooccur")
        doc_topic_vec = np.zeros(n_clusters) + 1e-6
        for c in existing_clusters:
            doc_topic_vec[c] = 1

        cluster_probs = co_occur @ doc_topic_vec

    # Avoid already-discussed clusters.
    cluster_probs[existing_clusters] *= 1e-6
    cluster_probs /= cluster_probs.sum()

    return existing_clusters, cluster_probs


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
