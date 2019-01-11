import re
import heapq
from collections import namedtuple

KeyboardState = namedtuple('KeyboardState', 'curText recs lastSpaceWasAuto')
initial_state = KeyboardState(curText='', recs=[], lastSpaceWasAuto=False)

def sim_keyboard(state, action):
    cur_text = state.curText
    cursor_pos = len(cur_text)
    last_space_idx = cur_text.rindex(' ') if ' ' in cur_text else -1
    prefix = cur_text[:last_space_idx + 1]
    cur_word = cur_text[last_space_idx + 1:]

    typ = action['type']
    if typ == 'rec':
        wordToInsert = state.recs[action['which']]
        chars_to_delete = len(cur_word)
        isNonWord = re.match(r'^\W$') is not None
        deleteSpace = state.lastSpaceWasAuto and isNonWord
        if deleteSpace:
            chars_to_delete += 1
        spliceText(
            cursor_pos - chars_to_delete,
            chars_to_delete,
            wordToInsert + " "
        )
        state = state._replace(lastSpaceWasAuto=True, recs=None)
    elif typ == 'key':
        state = state._replace(recs=None)
        pass
    elif typ == 'gotRecs':
        state = state._replace(recs=action['recs'])
    else:
        pass
    return state

def ideal_key_sequence(text, rec_gen):
    '''Search for the ideal key sequence to type 'text' using the given rec generator.
    
    Uses A*.'''
    def heuristic(candidate):
        # An admissable heuristic: delete all irrelevant text, tap out every key.
        to_delete = 0
        while text[:len(candidate)] != candidate:
            to_delete += 1
            candidate = candidate[:-1]
        return to_delete + len(text) - len(candidate)

    @lru_cache(maxsize=1024)
    def get_recs(cur_text):
        return rec_gen(TODO)

    # str -> (str, action)
    best_predecessor = {}
    # str -> int
    num_taps_to_type = {'': 0}

    # min-heap: ()
    hypotheses = [(heuristic(''), initial_state)]

    while len(hypotheses):
        current_estimated_cost, current_kbstate = heapq.heappop(hypotheses)
        if current_kbstate.curText == text:
            break
        
        # Enumerate various possible actions



def taps_to_type(stimulus, txt, threshold=None):
    if stimulus is None:
        def rec_gen(context, prefix=None):
            return onmt_model_2.get_recs('coco_lm', '.', context, prefix=prefix)
    else:
        def rec_gen(context, prefix=None):
            return onmt_model_2.get_recs('coco_cap', str(stimulus), context, prefix=prefix)

    actions = []
    # Invariant: performing [actions] types txt[:idx]
    idx = 0
    while idx < len(txt):
        sofar = txt[:idx]
        if ' ' in sofar:
            last_space_idx = sofar.rindex(' ')
        else:
            last_space_idx = -1
        prefix = sofar[:last_space_idx + 1]
        cur_word = sofar[last_space_idx + 1:]
        cur_desired_word = txt[last_space_idx + 1:].split(' ', 1)[0]
#         if cur_desired_word[-1] in ',.;-':
#             cur_desired_word = cur_desired_word[:-1]
#         print(repr(prefix), repr(cur_word), repr(cur_desired_word))
        recs = rec_gen(onmt_model_2.tokenize(prefix), prefix=cur_word)
        words = [word for word, rec in recs]
        if threshold is not None:
            show_recs = max(prob for word, prob in recs if prob is not None) > threshold
            if not show_recs:
                words = []
        # print(prefix, words)
        if cur_desired_word in words:
            actions.append(dict(type='rec', which=words.index(cur_desired_word), word=cur_desired_word))
            idx = last_space_idx + 1 + len(cur_desired_word) + 1
        else:
            actions.append(dict(type='key', key=txt[idx]))
            idx += 1
        # print(actions[-1])
    return actions

