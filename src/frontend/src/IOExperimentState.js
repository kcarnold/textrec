// @flow

import * as M from 'mobx';
import _ from 'lodash';
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

/*
Attention checks:
 - type: text, predictions, synonyms
 - the first time is forced: if it's not passed, then the participant has to tap it before moving on.
 - after that, failing an attention check has no effect.
*/

function randChoice(rng, choices) {
  let unif = 1;
  while (unif === 1)
    unif = rng();
  return choices[Math.floor(unif * choices.length)];
}

export class ExperimentStateStore {
  constructor(flags) {
    this.__version__ = 1;
    this.outstandingRequests = [];
    this.prevState = null;
    this.tapLocations = [];
    this.seqNums = [];
    this.flags = flags;
    M.extendObservable(this, {
      stimulus: "editor's note: in our behind the scenes series, cnn correspondents share their experiences in covering news and analyze the stories behind the events. here, soledad o'brien takes users inside a jail where many of the inmates are mentally ill. an inmate housed on the ``forgotten floor, ''where many mentally ill inmates are housed in miami before trial. miami, florida (cnn) -- the ninth floor of the miami-dade pretrial detention facility is dubbed the`` forgotten floor.'' here, inmates with the most severe mental illnesses are incarcerated until they're ready to appear in court. most often, they face drug charges or charges of assaulting an officer -- charges that judge steven leifman says are usually ``avoidable felonies. ''he says the arrests often result from confrontations with police. mentally ill people often wo n't do what they're told when police arrive on the scene -- confrontation seems to exacerbate their illness and they become more paranoid, delusional, and less likely to follow directions, according to leifman. so, they end up on the ninth floor severely mentally disturbed, but not getting any real help because they're in jail. we toured the jail with leifman. he is well known in miami as an advocate for justice and the mentally ill. even though we were not exactly welcomed with open arms by the guards, we were given permission to shoot videotape and tour the floor. go inside the `forgotten floor ''' at first, it's hard to determine where the people are. the prisoners are wearing sleeveless robes. imagine cutting holes for arms and feet in a heavy wool sleeping bag -- that's kind of what they look like. they're designed to keep the mentally ill patients from injuring themselves. that's also why they have no shoes, laces or mattresses. leifman says about one-third of all people in miami-dade county jails are mentally ill. so, he says, the sheer volume is overwhelming the system, and the result is what we see on the ninth floor. of course, it is a jail, so it's not supposed to be warm and comforting, but the lights glare, the cells are tiny and it's loud. we see two, sometimes three men -- sometimes in the robes, sometimes naked, lying or sitting in their cells.`` i am the son of the president. you need to get me out of here! ''one man shouts at me. he is absolutely serious, convinced that help is on the way -- if only he could reach the white house. leifman tells me that these prisoner-patients will often circulate through the system, occasionally stabilizing in a mental hospital, only to return to jail to face their charges. it's brutally unjust, in his mind, and he has become a strong advocate for changing things in miami. over a meal later, we talk about how things got this way for mental patients. leifman says 200 years ago people were considered ``lunatics'' and they were locked up in jails even if they had no charges against them. they were just considered unfit to be in society. over the years, he says, there was some public outcry, and the mentally ill were moved out of jails and into hospitals. but leifman says many of these mental hospitals were so horrible they were shut down. where did the patients go? nowhere. the streets. they became, in many cases, the homeless, he says. they never got treatment. leifman says in 1955 there were more than half a million people in state mental hospitals, and today that number has been reduced 90 percent, and 40,000 to 50,000 people are in mental hospitals. the judge says he's working to change this. starting in 2008, many inmates who would otherwise have been brought to the`` forgotten floor ''will instead be sent to a new mental health facility -- the first step on a journey toward long-term treatment, not just punishment. leifman says it's not the complete answer, but it's a start. leifman says the best part is that it's a win-win solution. the patients win, the families are relieved, and the state saves money by simply not cycling these prisoners through again and again. and, for leifman, justice is served. e-mail to a friend.",
      curText: '',
      attentionCheck: null,
      attentionCheckStats: {
        text: {total: 0, passed: 0, force: false},
        predictions: {total: 0, passed: 0, force: false},
        phrases: {total: 0, passed: 0, force: false},
        synonyms: {total: 0, passed: 0, force: false},
      },
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
          let predictions = _.range(3).map(() => blankRec);
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

        let {attentionCheck} = this;
        if (attentionCheck !== null && serverIsValid) {
          let {type: attentionCheckType} = attentionCheck;
          if (attentionCheckType === 'predictions' || attentionCheckType === 'synonyms') {
            let rec = result[attentionCheck.type][attentionCheck.slot];
            if (rec) {
              // [attentionCheck.slot].words.length > attentionCheck.word + 1) {
              // FIXME: this could be mutating a data structure that we don't own.
              rec.words[0] = 'æ' + rec.words[0];
              result.attentionCheckType = attentionCheck.type;
            }
          }
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
          taps = _.map(toInsert, () => null);
        }
        this.curText = this.curText.slice(0, startIdx) + toInsert + this.curText.slice(startIdx + deleteCount);
        this.tapLocations = this.tapLocations.slice(0, startIdx).concat(taps).concat(this.tapLocations.slice(startIdx + deleteCount));
        this.seqNums = this.seqNums.slice(0, startIdx).concat(_.map(toInsert, () => this.contextSequenceNum)).concat(this.seqNums.slice(startIdx + deleteCount));
      }),
      tapKey: M.action(event => {
        let ac = this.validateAttnCheck(event);
        if (ac.length) return ac;

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
        /* Ignore the attention check, don't count this for or against. */
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
        let ac = this.validateAttnCheck(event);
        if (ac.length) return ac;

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
        let ac = this.validateAttnCheck(event);
        if (ac.length) return ac;

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

      handleTapText: M.action(event => {
        return this.validateAttnCheck(event);
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


    return {
      type: 'rpc',
      rpc: {
        method: 'get_rec',
        stimulus: this.stimulus,
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

  validateAttnCheck(event) {
    if (this.attentionCheck === null) return [];
    let {type: attentionCheckType} = this.attentionCheck;
    let passed;
    if (attentionCheckType === 'text') {
      passed = event.type === 'tapText';
    } else if (attentionCheckType === 'predictions' || attentionCheckType === 'synonyms') {
      // only valid if there was a corresponding valid rec.
      if (!this.visibleSuggestions.attentionCheckType) return [];

      passed = (attentionCheckType === event.which && this.attentionCheck.slot === event.slot);
    }

    let stat = this.attentionCheckStats[attentionCheckType];
    if (passed) {
        this.attentionCheck = null;
        if (!stat.force) {
          stat.total++;
          stat.passed++;
        } else {
          stat.force = false;
        }
        return [{type: 'passedAttnCheck'}];
    } else {
      // The first time we're going to force it. Don't give them credit.
      if (stat.total === 0) {
        stat.force = true;
        return [{type: 'failedAttnCheckForce'}];
      } else {
        // Whatever, let 'em fail.
        console.assert(!stat.force);
        this.attentionCheck = null;
        stat.total++;
        return []; // {type: 'failedAttnCheck'} -- no, just do the action anyway.
      }
    }
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
      case 'tapText':
        return this.handleTapText(event);
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
