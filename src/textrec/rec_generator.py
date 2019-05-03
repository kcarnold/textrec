import json
import traceback

import nltk
import numpy as np
import wordfreq

from . import cueing

N_CLUSTERS = 128
MIN_CLUSTER_SIZE = 20


async def handle_request_async(executor, request):
    method = request["method"]
    if method == "get_rec":
        result = await get_keystroke_rec(executor, request)
    elif method == "get_cue":
        result = await get_cue_API(executor, request)
    print("Result:", result)
    return result


domain_to_dataset = dict(restaurant="yelp", movie="imdb", bio="bios")


async def get_cue_API(executor, request):
    rec_type = request["recType"]
    domain = request["domain"]

    text = request["text"]
    dataset_name = domain_to_dataset[domain]

    if rec_type == "randomSents":
        return get_cue_random(dataset_name=dataset_name)
    elif rec_type == "cueSents":
        return get_cue(text, dataset_name=dataset_name, mode="example")


def get_cue_random(*, dataset_name):
    sentences = cueing.cached_sentences(dataset_name)

    cues = [dict(text=sentence) for sentence in sentences.raw_sent.sample(n=10)]
    return dict(cues=cues)


def get_cue(text, *, dataset_name, n_clusters_to_cue=10, mode, n_clusters=128):
    existing_clusters, next_cluster_scores = next_cluster_distribution(
        text=text,
        dataset_name=dataset_name,
        n_clusters=n_clusters,
        use_sequence_lm=False,
    )

    if mode == "cue_phrase":
        scores_by_cluster_argsort, unique_starts = cueing.cached_scores_by_cluster_argsort(
            dataset_name=dataset_name, n_clusters=n_clusters
        )

        def get_cue_for_cluster(cluster_to_cue):
            # Cue one of the phrases for this cluster.
            if cluster_to_cue not in scores_by_cluster_argsort:
                # Some clusters were deleted... for now just skip them :(
                return

            phrase_idx = scores_by_cluster_argsort[cluster_to_cue][0]
            phrase = " ".join(unique_starts[phrase_idx])
            return dict(text=phrase)

    elif mode == "example":
        topic_data = cueing.cached_topic_data(
            dataset_name=dataset_name, n_clusters=n_clusters
        )
        topic_labeled_sentences = topic_data["sentences"]

        def get_cue_for_cluster(cluster_to_cue):
            cluster_sentences = topic_labeled_sentences[
                topic_labeled_sentences.topic == cluster_to_cue
            ]
            if len(cluster_sentences) > MIN_CLUSTER_SIZE:
                sentence = cluster_sentences.raw_sent.sample(n=1).iloc[0]
                return dict(text=sentence)

    else:
        assert False

    clusters_to_cue = np.argsort(next_cluster_scores)[::-1]

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


def topic_sequence_logprobs(existing_clusters, dataset_name, n_clusters):
    seq_model = cueing.cached_topic_sequence_lm(dataset_name, n_clusters)
    state, _ = seq_model.get_state(
        " ".join(str(c) for c in existing_clusters), bos=True
    )
    cluster_indices = [seq_model.model.vocab_index(str(n)) for n in range(n_clusters)]
    logprobs = seq_model.eval_logprobs_for_words(state, cluster_indices)
    return logprobs


def next_cluster_distribution(text, dataset_name, n_clusters, use_sequence_lm):
    # assert dataset_name == "yelp"
    topic_data = cueing.cached_topic_data(dataset_name, n_clusters=n_clusters)

    tokenized_doc = tokenize(text)
    vectorizer = topic_data["vectorizer"]
    projection_mat = topic_data["projection_mat"]
    clusterer = topic_data["clusterer"]

    sents = tokenized_doc.split("\n")
    vecs = vectorizer.transform(sents)
    projected = vecs.dot(projection_mat)
    existing_clusters = clusterer.predict(projected)

    if use_sequence_lm:
        logprobs = topic_sequence_logprobs(existing_clusters, dataset_name, n_clusters)
    else:
        logprobs = np.zeros(n_clusters)

    # Avoid already-discussed clusters.
    logprobs[existing_clusters] -= 100

    return existing_clusters, logprobs


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
