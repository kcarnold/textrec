// @flow

import * as M from 'mobx';
import range from 'lodash/range';
import map from 'lodash/map'
import countWords from './CountWords';
import seedrandom from 'seedrandom';
import type {Event} from './Events';

/**** Main experiment-screen state store!

This represents all the state relevant to a trial.

A Suggestion is an important object. It contains:
{
  // The context in which it was made
  contextSequenceNum: int
  prefix: string : characters before this suggestion
  tapLocations: array of {x: int, y: int}: cur-word taps
  words: array of string: the words of the suggestion
  meta: metadata about this suggestion (e.g., if it's a beginning-of-sentence suggestion)
  isValid: for a visible suggestion, whether it's valid in the current suggestion context.
}

We keep a list of the current suggestions. If a suggestion's sequence number doesn't match, we can still show it (so as to not be jarring), but dim it, and don't allow acceptance.

After tapping a suggestion, it becomes *active*, which means that if we keep tapping on that same spot, subsequent words will get inserted. To do this, we keep a notion of an `activeSuggestion`, which is separate from the suggestions returned from the server:
{
  suggestion: the Suggestion object
  slot: the slot number where it lives
  wordIdx: the index of the next word to insert.
}

We're not caching because (1) caching is a Hard Problem and (2) key taps will be at different places anyway, so caching won't really help.
It may be nice to prefetch what happens when a suggestion gets pressed, because there are only 3 states there and we know them exactly.
But TODO.

visibleSuggestions is a pure computation based on the last suggestions received from the server, the current context sequence number, and the active suggestion. It puts them all together, keeping track of what's valid.

*/

function randChoice(rng, choices) {
  let unif = 1;
  while (unif === 1)
    unif = rng();
  return choices[Math.floor(unif * choices.length)];
}

type Stimulus = {
  type: string,
  content: string,
}

type IOExperimentFlags = {
  stimulus: Stimulus,
  modelSeesStimulus: boolean,
};

export class ExperimentStateStore {
  outstandingRequests: number[];

  curText: string;

  constructor(flags: IOExperimentFlags) {
    this.outstandingRequests = [];
    this.prevState = null;
    this.tapLocations = [];
    this.seqNums = [];
    this.flags = flags;
    M.extendObservable(this, {
      stimulus: flags.stimulus,
      transcribe: flags.transcribe,
      curText: '',
      contextSequenceNum: 0,
      lastSuggestionsFromServer: {},
      activeSuggestion: null,
      lastSpaceWasAuto: false,
      electricDeleteLiveChars: null,
      get wordCount() {
        return countWords(this.curText);
      },
      get visibleSuggestions() {
        let fromServer = this.lastSuggestionsFromServer;
        const blankRec = {words: []};
        let serverIsValid = fromServer.request_id === this.contextSequenceNum;
        if (!serverIsValid) {
          // Fill in the promised suggestion.
          let predictions = range(3).map(() => blankRec);
          if (this.activeSuggestion) {
            predictions[this.activeSuggestion.slot] = M.toJS(this.activeSuggestion);
          }
          return {predictions};
        }

        // Make a copy, so we can modify.
        fromServer = M.toJS(fromServer);
        let result = {};
        if (fromServer.replacement_range)
          result.replacement_range = fromServer.replacement_range;
        ['predictions', 'synonyms'].forEach(type => {
          result[type] = fromServer[type] || [];
          let minToReturn = type === 'synonyms' ? 10 : 3;
          while(result[type].length < minToReturn) {
            result[type].push(blankRec);
          }
        });

        if (this.activeSuggestion && this.activeSuggestion.highlightChars) {
          // Highlight even what we receive from the server.
          // FIXME: should this happen on server? Format conversion is complicated...
          result.predictions[this.activeSuggestion.slot].highlightChars = this.activeSuggestion.highlightChars;
        }

        return result;
      },

      get lastSpaceIdx() {
        let sofar = this.curText;
        return sofar.search(/\s\S*$/);
      },

      get suggestionContext() {
        let sofar = this.curText, cursorPos = sofar.length;
        let lastSpaceIdx = this.lastSpaceIdx;
        let curWord = [];
        for (let i=lastSpaceIdx + 1; i<cursorPos; i++) {
          let chr = {letter: sofar[i]};
          if (this.tapLocations[i] !== null) {
            chr.tap = this.tapLocations[i];
          }
          curWord.push(chr);
        }
        let result = {
          prefix: sofar.slice(0, lastSpaceIdx + 1),
          curWord,
        };
        if (this.activeSuggestion) {
          result.promise = {
            slot: this.activeSuggestion.slot,
            words: this.activeSuggestion.words
          };
        }
        return result;
      },

      get hasPartialWord() {
        return this.suggestionContext.curWord.length > 0;
      },

      get showPredictions() {
        return true;
      },

      spliceText: M.action((startIdx, deleteCount, toInsert, taps) => {
        if (!taps) {
          taps = map(toInsert, () => null);
        }
        this.curText = this.curText.slice(0, startIdx) + toInsert + this.curText.slice(startIdx + deleteCount);
        this.tapLocations = this.tapLocations.slice(0, startIdx).concat(taps).concat(this.tapLocations.slice(startIdx + deleteCount));
        this.seqNums = this.seqNums.slice(0, startIdx).concat(map(toInsert, () => this.contextSequenceNum)).concat(this.seqNums.slice(startIdx + deleteCount));
      }),
      tapKey: M.action(event => {
        let cursorPos = this.curText.length;
        let oldCurWord = this.curText.slice(this.lastSpaceIdx + 1);

        let isNonWord = event.key.match(/\W/);
        let deleteSpace = this.lastSpaceWasAuto && isNonWord;
        let toInsert = event.key;
        let taps = [{x: event.x, y: event.y}];
        let autoSpace = isNonWord && event.key !== " " && event.key !== "'" && event.key !== '-';
        if (autoSpace) {
          toInsert += " ";
          taps.push({});
        }
        let charsToDelete = deleteSpace ? 1 : 0;
        this.spliceText(cursorPos - charsToDelete, charsToDelete, toInsert, taps);
        this.lastSpaceWasAuto = autoSpace;
        let newActiveSuggestion = null;

        // If this key happened to be the prefix of a recommended word, continue that word.
        let curWord = this.curText.slice(this.lastSpaceIdx + 1);
        if (this.flags.showRelevanceHints && !isNonWord && curWord.slice(0, oldCurWord.length) === oldCurWord) {
          this.visibleSuggestions.predictions.forEach((pred, slot) => {
            if (pred.words.length === 0) return;
            if (newActiveSuggestion) return;
            if (pred.words[0].slice(0, curWord.length) === curWord) {
              newActiveSuggestion = {
                words: pred.words,
                slot,
                highlightChars: curWord.length
              };
            }
          });
        }
        this.activeSuggestion = newActiveSuggestion;

        return [];
      }),
      tapBackspace: M.action((event) => {
        let {delta} = event;
        if (delta === undefined)
          delta = -1;
        this.spliceText(this.curText.length + delta, -delta, '');
        this.lastSpaceWasAuto = false;
        this.activeSuggestion = null;
        this.electricDeleteLiveChars = null;
        return [];
      }),
      handleTapSuggestion: M.action(event => {
        let {slot, which} = event;
        let tappedSuggestion = this.visibleSuggestions[which][slot];
        let wordToInsert = tappedSuggestion.words[0];
        if (!wordToInsert) return [];
        if (which === 'synonyms') {
          // Replace the _previous_ word.
          let [startIdx, endIdx] = this.visibleSuggestions['replacement_range'];
          // Actually, kill all remaining text.
          endIdx = this.curText.length;
          let autoSpace = endIdx === this.curText.length;
          this.spliceText(startIdx, endIdx - startIdx, wordToInsert);
          if (autoSpace) {
            // Add a space.
            this.spliceText(this.curText.length, 0, ' ');
          }
          if (this.curText.slice(-1) === ' ') {
            this.lastSpaceWasAuto = true;
          }
        } else {
          if (tappedSuggestion.words.length > 1) {
            this.activeSuggestion = {
              words: tappedSuggestion.words.slice(1),
              slot: slot,
            };
          } else {
            this.activeSuggestion = null;
          }

          let {curWord} = this.getSuggestionContext();
          let charsToDelete = curWord.length;
          let isNonWord = wordToInsert.match(/^\W$/);
          let deleteSpace = this.lastSpaceWasAuto && isNonWord;
          if (deleteSpace) {
            charsToDelete++;
          }
          this.spliceText(this.curText.length - charsToDelete, charsToDelete, wordToInsert + ' ');
          this.lastSpaceWasAuto = true;
        }
        return [];
      }),

      handleSelectAlternative: M.action(event => {
        let wordToInsert = event.word;
        let {curWord} = this.getSuggestionContext();
        let charsToDelete = curWord.length;
        let isNonWord = wordToInsert.match(/^\W$/);
        let deleteSpace = this.lastSpaceWasAuto && isNonWord;
        if (deleteSpace) {
          charsToDelete++;
        }
        this.spliceText(this.curText.length - charsToDelete, charsToDelete, wordToInsert + ' ');
        this.lastSpaceWasAuto = true;
        return [];
      }),

      handleUndo: M.action(event => {
        if (this.prevState) {
          this.curText = this.prevState.curText;
          this.tapLocations = this.prevState.tapLocations;
          this.seqNums = this.prevState.seqNums;
          this.activeSuggestion = this.prevState.activeSuggestion;
          this.prevState = null;
        }
      }),

      updateSuggestions: M.action(event => {
        let {msg} = event;
        // Only update suggestions if the data is valid.
        if (!msg.result) {
          console.warn("Request failed?");
          return;
        }
        let {request_id} = msg.result;
        if (request_id === this.contextSequenceNum) {
          this.lastSuggestionsFromServer = msg.result;
        }
        let idx = this.outstandingRequests.indexOf(request_id);
        if (idx !== -1) {
          this.outstandingRequests.splice(idx, 1);
        }
        if (idx !== 0) {
          console.log('warning: outstandingRequests weird: looking for', request_id, 'in', this.outstandingRequests);
        }
      }),

      handleDeleting: M.action(event => {
        let {delta} = event;
        this.electricDeleteLiveChars = Math.min(Math.max(0, this.curText.length + delta), this.curText.length);
        return [];
      })
    });
  }

  init() {
    this.outstandingRequests.push(0);
    return this.getSuggestionRequest();
  }

  getSuggestionRequest() {
    let {prefix, curWord, promise} = this.getSuggestionContext();

    let stimulus = {
      type: this.stimulus.type,
      content: this.flags.modelSeesStimulus ? this.stimulus.content : null,
    };

    return {
      type: 'rpc',
      rpc: {
        method: 'get_rec',
        stimulus: stimulus,
        sofar: prefix,
        cur_word: curWord,
        flags: {...this.sugFlags, promise,},
        request_id: this.contextSequenceNum
      }
    };
  }

  getSuggestionContext() {
    return this.suggestionContext;
  }

  handleEvent = (event) => {
    let prevState = {
      curText: this.curText,
      tapLocations: this.tapLocations.slice(),
      seqNums: this.seqNums.slice(),
      activeSuggestion: this.activeSuggestion
    };
    let sideEffects = (() => {
      switch (event.type) {
      case 'undo':
        return this.handleUndo(event);
      case 'tapKey':
        return this.tapKey(event);
      case 'tapBackspace':
        return this.tapBackspace(event);
      case 'backendReply':
        return this.updateSuggestions(event);
      case 'tapSuggestion':
        return this.handleTapSuggestion(event);
      case 'selectAlternative':
        return this.handleSelectAlternative(event);
      case 'updateDeleting':
        return this.handleDeleting(event);
      default:
      }
    })();
    sideEffects = sideEffects || [];

    if (this.curText !== prevState.curText) {
      this.contextSequenceNum++;
      this.prevState = prevState;
    }

    if (this.lastSuggestionsFromServer.request_id !== this.contextSequenceNum) {
      if (this.outstandingRequests.indexOf(this.contextSequenceNum) !== -1) {
        // console.log("Already requested", this.contextSequenceNum);
      } else if (this.outstandingRequests.length < 2) {
        // console.log(`event ${event.type} triggered request ${this.contextSequenceNum}`)
        sideEffects = sideEffects.concat([this.getSuggestionRequest()]);
        this.outstandingRequests.push(this.contextSequenceNum);
      } else {
        // console.log(`event ${event.type} would trigger request ${this.contextSequenceNum} but throttled ${this.outstandingRequests}`)
      }
    }

    return sideEffects;
  };
}
