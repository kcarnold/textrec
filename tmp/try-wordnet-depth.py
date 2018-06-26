"""
Try measuring specificity using WordNet depth of nouns used.

This turned out to be hard because (1) WordNet doesn't have some words used (e.g., "toilet paper", unless you count that as two nouns), and (2) off-the-shelf approaches to word-sense disambiguation performed terribly on the captions I tried.
"""
from nltk.corpus import wordnet as wn
[(tok.orth_, tok.lemma_, tok.pos_) for tok in  automated_analyses.nlp(trial_level.text.iloc[5])]

wn.synsets('red', wn.ADJ)

wn.synsets('quickly', wn.ADV)[0].max_depth()

from nltk import wsd
import pywsd

text = trial_level.text.iloc[60]
print(text)
for tok, ss in pywsd.disambiguate(text):
    if ss is not None:
        print(f'{tok:20s} {ss.definition()}')

'''
results:
a red double-decker bus is coming down the street
red                  of a color at the end of the color spectrum (next to orange); resembling the color of blood or cherries or tomatoes or rubies
double-decker        a vehicle carrying many passengers; used for public transport
bus                  a vehicle carrying many passengers; used for public transport
coming               reach or enter a state, relation, condition, use, or position
street               people living or working on the same street
'''

text = trial_level.text.iloc[2]
print(text)
spacy_to_wn = {
    'ADJ': wn.ADJ,
#     'ADV': wn.ADV,
    'NOUN': wn.NOUN,
    'VERB': wn.VERB,    
}
doc = automated_analyses.nlp(text)
toks = [tok.orth_ for tok in doc]
for tok in doc:
    if tok.pos_ not in spacy_to_wn:
        continue
    ss = wsd.lesk(toks, tok.lemma_)
#         for ss in wn.synsets(tok.lemma_, spacy_to_wn[tok.pos_])[:1]:
    print(ss.name(), ss.definition(), ss.max_depth())

'''
a bathroom with a toilet and sink and with a roll of toilet paper on the toilet
bathroom.n.01 a room (as in a residence) containing a bathtub or shower and usually a washbasin and toilet 8
toilet.n.04 the act of dressing and preparing yourself 9
sinkhole.n.01 a depression in the ground communicating with a subterranean passage (especially in limestone) and formed by solution or by collapse of a cavern roof 5
roll.v.17 take the shape of a roll or cylinder 2
toilet.n.04 the act of dressing and preparing yourself 9
paper.n.05 a scholarly article describing the results of observations or stating hypotheses 8
toilet.n.04 the act of dressing and preparing yourself 9
'''
