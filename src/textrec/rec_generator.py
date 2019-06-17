import json
import traceback

import nltk
import numpy as np
import wordfreq

from . import cueing

try:
    from icecream import ic
except ImportError:  # Graceful fallback if IceCream isn't installed.
    ic = lambda *a: None if not a else (a[0] if len(a) == 1 else a)  # noqa

N_CLUSTERS = 128
MIN_CLUSTER_SIZE = 20

PRELOAD_MODELS = [
    # "yelp_128",
    "wiki-book_128",
    "wiki-film_128",
    # "imdb_128",
    # "newsroom_128",
    "wikivoyage_128",
    #    'bios'
]
PARTS_NEEDED = [
    "sentences",
    "labels_and_sents",
    "labels",
    "vectorizer",
    "projection_mat",
]


cueing.preload_models(PRELOAD_MODELS, PARTS_NEEDED)


async def handle_request_async(executor, request):
    method = request["method"]
    if method == "get_rec":
        result = await get_keystroke_rec(executor, request)
    elif method == "get_cue":
        result = await get_cue_API(executor, request)
    elif method == "analyze_doc":
        result = analyze_doc(request)
    print("Result:", result)
    return result


domain_to_model = dict(
    restaurant="yelp_128",
    movie="imdb_128",
    bio="bios_128",
    news="newsroom_128",
    wikivoyage="wikivoyage_128",
)
domain_to_model["wiki-book"] = "wiki-book_128"
domain_to_model["wiki-film"] = "wiki-film_128"


async def get_cue_API(executor, request):
    rec_type = request["recType"]
    domain = request["domain"]
    n_cues = request.get("n_cues", 5)

    text = request["text"]

    if rec_type == "practice":
        assert domain == "_q"
        candidates = get_cue_practice_q(text, n_cues=n_cues)
        return dict(cues=[dict(text=candidate) for candidate in candidates])

    model_name = domain_to_model[domain]
    if rec_type == "randomSents":
        return get_cue_random(model_name=model_name, n_cues=n_cues)
    elif rec_type == "cueSents":
        return get_cue(text, model_name=model_name, n_cues=n_cues, mode="example")
    elif rec_type == "cueWords":
        return get_cue(text, model_name=model_name, n_cues=n_cues, mode="label3")
    elif rec_type == "highlightedSents":
        return get_cue(
            text, model_name=model_name, n_cues=n_cues, mode="exampleHighlighted"
        )
    elif rec_type == "randomWords":
        return get_cue_random_words(model_name=model_name, n_cues=n_cues)


def get_cue_random(*, model_name, n_cues):
    sentences = cueing.get_model(model_name, "sentences")

    cues = [dict(text=sentence) for sentence in sentences.raw_sent.sample(n=n_cues)]
    return dict(cues=cues)


def get_cue_random_words(*, model_name, n_cues):
    sentences = cueing.get_model(model_name, "sentences")
    selected_sentences = sentences.sent.sample(n=n_cues * 2)
    cues = []
    for sentence in selected_sentences:
        tokens = sentence.split()
        if len(tokens) < 4:
            continue
        tok_idx = np.random.choice(len(tokens) - 3)
        phrase = " ".join(tokens[tok_idx : tok_idx + 3])
        cues.append(dict(text=phrase))
        if len(cues) == n_cues:
            break
    return dict(cues=cues)


def get_cue(text, *, model_name, n_cues, mode, method="w2v", randomize=False):
    n_clusters_to_cue = n_cues
    existing_clusters, next_cluster_probs = next_cluster_distribution(
        text=text, model_name=model_name, method=method
    )

    cluster_labels = cueing.get_model(model_name, "labels")

    def get_label_for_cluster(cluster_idx):
        return " / ".join(cluster_labels[cluster_idx])

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
        is_close = cueing.get_model(model_name, "is_close")

        # topic_labeled_sentences["close_to_cluster_center"] = is_close
        topic_labeled_sentences = topic_labeled_sentences[is_close]

        def get_cue_for_cluster(cluster_to_cue):
            cluster_sentences = topic_labeled_sentences[
                topic_labeled_sentences.topic == cluster_to_cue
            ]
            if len(cluster_sentences) > MIN_CLUSTER_SIZE:
                idx = np.random.choice(len(cluster_sentences))
                sentence = cluster_sentences.raw_sent.iloc[idx]
                return dict(
                    text=sentence,
                    label=get_label_for_cluster(cluster_to_cue),
                    # is_close=cluster_sentences.close_to_cluster_center.iloc[idx].item(),
                )

    elif mode == "exampleHighlighted":
        labels_and_sents = cueing.get_model(model_name, "labels_and_sents")

        def get_cue_for_cluster(cluster_to_cue):
            if cluster_to_cue not in labels_and_sents:
                return
            label, candidates = labels_and_sents[cluster_to_cue]
            candidate_idx = np.random.choice(len(candidates))
            sentence, label_span = candidates[candidate_idx]
            return dict(
                text=sentence,
                highlightSpan=label_span,
                label=get_label_for_cluster(cluster_to_cue),
            )

    elif mode == "label3":

        def get_cue_for_cluster(cluster_to_cue):
            return dict(text=get_label_for_cluster(cluster_to_cue))

    else:
        assert False

    if randomize:
        clusters_to_cue = np.random.choice(
            len(next_cluster_probs),
            size=len(next_cluster_probs),
            replace=False,
            p=next_cluster_probs,
        )
    else:
        clusters_to_cue = np.argsort(next_cluster_probs)[::-1]

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

    existing_clusters_labeled = [
        (idx, get_label_for_cluster(idx)) for idx in existing_clusters.tolist()
    ]
    return dict(cues=cues, existing_clusters=existing_clusters_labeled)


# Cribbed from preprocess_yelp.py
def tokenize(text):
    if isinstance(text, list):
        sents = text
    else:
        sents = nltk.sent_tokenize(text)
    token_spaced_sents = [
        " ".join(wordfreq.tokenize(sent, "en", include_punctuation=True))
        for sent in sents
    ]
    return token_spaced_sents


def topic_sequence_logprobs(existing_clusters, model_name):
    clusterer = cueing.get_model(model_name, "clusterer")
    n_clusters = clusterer.n_clusters
    seq_model = cueing.get_model(model_name, "topic_sequence_model")
    state, _ = seq_model.get_state(
        " ".join(str(c) for c in existing_clusters), bos=True
    )
    cluster_indices = [seq_model.model.vocab_index(str(n)) for n in range(n_clusters)]
    logprobs = seq_model.eval_logprobs_for_words(state, cluster_indices)
    return logprobs


def next_cluster_distribution_given_context_clusters(
    *, model_name, existing_clusters, n_clusters, existing_clusters_weight=1e-6, method
):
    if method == "topic_lm":
        logprobs = topic_sequence_logprobs(existing_clusters, model_name)
        cluster_probs = np.exp(logprobs)
    elif method == "w2v":
        model = cueing.get_model(model_name, "topic_w2v")
        overall_topic_distribution = cueing.get_model(
            model_name, "overall_topic_distribution"
        )
        cluster_probs = cueing.predict_missing_topics_w2v(
            model,
            existing_clusters=existing_clusters,
            n_clusters=n_clusters,
            overall_topic_distribution=overall_topic_distribution,
        )

    # Avoid already-discussed clusters.
    cluster_probs[existing_clusters] *= existing_clusters_weight
    cluster_probs /= cluster_probs.sum()
    return cluster_probs


def get_clusters_for_existing_doc(tokenized_sents, model_name):
    vectorizer = cueing.get_model(model_name, "vectorizer")
    projection_mat = cueing.get_model(model_name, "projection_mat")
    clusterer = cueing.get_model(model_name, "clusterer")
    n_clusters = clusterer.n_clusters

    if len(tokenized_sents):
        vecs = vectorizer.transform(tokenized_sents)
        projected = vecs.dot(projection_mat)
        existing_clusters = clusterer.predict(projected)
    else:
        existing_clusters = np.array([], dtype=int)
    return existing_clusters, n_clusters


def analyze_doc(request):
    """
    Show how the clusterer understands an existing document.
    """
    domain = request["domain"]
    model_name = domain_to_model[domain]
    text = request["text"]

    raw_sents, tokenized_sents = cueing.tokenize_with_ner(text)
    clusters, n_clusters = get_clusters_for_existing_doc(tokenized_sents, model_name)

    cluster_labels = cueing.get_model(model_name, "labels")

    clusters_with_labels = [
        dict(cluster_id=int(cluster_id), label=" / ".join(cluster_labels[cluster_id]))
        for cluster_id in clusters
    ]

    return dict(
        raw_sents=raw_sents,
        tokenized_sents=tokenized_sents,
        clusters=clusters_with_labels,
    )


def next_cluster_distribution(text, model_name, method, existing_clusters_weight=1e-6):
    existing_clusters, n_clusters = get_clusters_for_existing_doc(
        tokenized_sents=tokenize(text), model_name=model_name
    )

    cluster_probs = next_cluster_distribution_given_context_clusters(
        model_name=model_name,
        existing_clusters=existing_clusters,
        n_clusters=n_clusters,
        existing_clusters_weight=existing_clusters_weight,
        method=method,
    )

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


def get_q_wordlist():
    import wordfreq

    freq_dict = wordfreq.get_frequency_dict("en")
    from nltk.corpus import wordnet

    results = (
        word
        for word, freq in freq_dict.items()
        if len(word) > 3 and word[1] == "q" and freq > 1e-8
    )
    results = [word for word in results if len(wordnet.synsets(word)) > 0]
    results.sort()
    # results = sorted({wordnet.morphy(word) for word in results})
    return results


WORDS_WITH_Q_AS_SECOND_LETTER = "aqua aquacultural aquaculture aquae aqualung aquamarine aquamarines aquanaut aquanauts aquaplaning aquaria aquarium aquariums aquarius aquas aquatic aquatics aquatint aquatinted aquatints aquavit aqueduct aqueducts aqueous aquifer aquifers aquila aquilegia aquiline aquinas aquitaine aquitania equable equal equaled equaling equalisation equalise equalised equaliser equalisers equalises equalising equalitarian equalities equality equalization equalize equalized equalizer equalizers equalizes equalizing equalled equalling equally equals equanimity equanimous equate equated equates equating equation equations equator equatorial equerries equerry equestrian equestrians equiangular equidae equidistant equids equilateral equilibrate equilibrated equilibrates equilibrating equilibration equilibria equilibrium equilibriums equine equines equinoctial equinox equinoxes equip equipage equiped equipes equipment equipments equipoise equipped equipping equips equipt equisetum equitable equitably equitation equities equity equivalence equivalences equivalent equivalents equivocal equivocally equivocate equivocated equivocates equivocating equivocation equivocations squab squabble squabbled squabbles squabbling squabs squad squadron squadrons squads squalid squall squalling squalls squally squalor squalus squama squamata squander squandered squandering squanders square squared squarely squareness squarer squares squaring squarish squash squashed squashes squashing squashy squat squating squats squatted squatter squatters squatting squatty squaw squawk squawked squawking squawks squaws squeak squeaked squeaker squeakers squeaking squeaks squeaky squeal squealed squealer squealers squealing squeals squeamish squeamishness squeegee squeegees squeezable squeeze squeezed squeezer squeezers squeezes squeezing squelch squelched squelches squelching squib squibs squid squids squiffy squiggle squiggles squiggly squill squilla squinch squinches squint squinted squinting squints squinty squire squired squires squiring squirm squirmed squirming squirms squirrel squirrels squirt squirted squirter squirters squirting squirts squish squished squishes squishing squishy".split()


def get_cue_practice_q(already_got, n_cues):
    assert isinstance(already_got, list)
    already_got = set(already_got)

    candidates = []
    for word in WORDS_WITH_Q_AS_SECOND_LETTER:
        if word in already_got:
            continue
        letter_to_blank = np.random.choice(len(word) - 1)
        if letter_to_blank > 0:
            # Never blank the second letter (the q)
            letter_to_blank += 1
        hint = word[:letter_to_blank] + "_" + word[letter_to_blank + 1 :]
        candidates.append(hint)
    np.random.shuffle(candidates)
    return candidates[:n_cues]
