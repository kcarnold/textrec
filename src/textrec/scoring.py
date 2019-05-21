from textrec import automated_analyses

open_class_POS_tags = set("ADJ ADV INTJ NOUN PROPN VERB".split())


def get_openclass_words(doc):
    return [token for token in doc if token.pos_ in open_class_POS_tags]


def word_vec_stats(text):
    doc = automated_analyses.nlp(text)
    tokens = get_openclass_words(doc)
    vecs = np.array([token.vector for token in tokens])
    # https://stats.stackexchange.com/a/51117/19924
    covariance, shrinkage = ledoit_wolf(vecs, assume_centered=False)
    return dict(
        num_terms=len(tokens),
        mean_pairwise_cosine_dist=np.mean(pdist(vecs, metric="cosine")),
        word_vec_var=np.mean(np.var(vecs, axis=0)),
        covariance_trace=np.trace(covariance),
        # covariance_det=np.linalg.det(covariance),
        # Since the number of words is much less than the number of dimensions, the covariance
        # matrix is almost surely degenerate, so we'd expect its determinant to be nearly zero.
    )
