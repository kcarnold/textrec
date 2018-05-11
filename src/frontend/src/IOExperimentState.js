// @flow

import {
  decorate,
  observable,
  computed,
  action,
  toJS,
} from "mobx";
import range from "lodash/range";
import map from "lodash/map";
import countWords from "./CountWords";
import type { Event, TapSuggestion, TapKey, TapBackspace, UpdateSuggestions, Deleting } from "./Events";

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

type Stimulus = {
  type: string,
  content: string,
};

type IOExperimentFlags = {
  stimulus: Stimulus,
  modelSeesStimulus: boolean,
  requestFlags: Object,
  showRelevanceHints: boolean,
  transcribe?: string
};

type Tap = {
  x?: ?number,
  y?: ?number
};

export class ExperimentStateStore {
  outstandingRequests: number[] = [];

  prevState: ?Object = null; // TODO
  tapLocations: (?Tap)[] = [];
  seqNums: number[] = [];

  flags: IOExperimentFlags;
  stimulus: Stimulus;
  transcribe: string;

  curText: string = "";
  contextSequenceNum: number = 0;
  lastSuggestionsFromServer: Object = {};
  activeSuggestion: ?Object = null;
  lastSpaceWasAuto: boolean = false;
  electricDeleteLiveChars: ?number = null;

  eventCounts: Object = {};

  constructor(flags: IOExperimentFlags) {
    this.flags = flags;
    this.stimulus = flags.stimulus;
    this.transcribe = flags.transcribe;
  }

  // Computed properties.

  get wordCount() {
    return countWords(this.curText);
  }

  get visibleSuggestions() {
    let fromServer = this.lastSuggestionsFromServer;
    const blankRec = { words: [] };
    let serverIsValid = fromServer.request_id === this.contextSequenceNum;
    if (!serverIsValid) {
      // Fill in the promised suggestion.
      let predictions = range(3).map(() => blankRec);
      if (this.activeSuggestion) {
        predictions[this.activeSuggestion.slot] = toJS(this.activeSuggestion);
      }
      return { predictions };
    }

    // Make a copy, so we can modify.
    fromServer = toJS(fromServer);
    let result = {};
    if (fromServer.replacement_range)
      result.replacement_range = fromServer.replacement_range;
    ["predictions", "synonyms"].forEach(type => {
      result[type] = fromServer[type] || [];
      let minToReturn = type === "synonyms" ? 10 : 3;
      while (result[type].length < minToReturn) {
        result[type].push(blankRec);
      }
    });

    if (this.activeSuggestion && this.activeSuggestion.highlightChars) {
      // Highlight even what we receive from the server.
      // FIXME: should this happen on server? Format conversion is complicated...
      result.predictions[
        this.activeSuggestion.slot
      ].highlightChars = this.activeSuggestion.highlightChars;
    }

    if (this.flags.suggestionFilter) {
      result = this.flags.suggestionFilter(result, this);
    }

    return result;
  }

  get lastSpaceIdx() {
    let sofar = this.curText;
    return sofar.search(/\s\S*$/);
  }

  get suggestionContext() {
    let sofar = this.curText,
      cursorPos = sofar.length;
    let lastSpaceIdx = this.lastSpaceIdx;
    let curWord = [];
    for (let i = lastSpaceIdx + 1; i < cursorPos; i++) {
      let chr = { letter: sofar[i] };
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
        words: this.activeSuggestion.words,
      };
    }
    return result;
  }

  get hasPartialWord() {
    return this.suggestionContext.curWord.length > 0;
  }

  get showPredictions() {
    return true;
  }

  // Actions

  spliceText(startIdx: number, deleteCount: number, toInsert: string, taps?: (?Tap)[]) {
    let toInsert_range = range(toInsert.length);
    if (!taps) {
      taps = map(toInsert_range, () => null);
    }
    this.curText =
      this.curText.slice(0, startIdx) +
      toInsert +
      this.curText.slice(startIdx + deleteCount);
    this.tapLocations = this.tapLocations
      .slice(0, startIdx)
      .concat(taps)
      .concat(this.tapLocations.slice(startIdx + deleteCount));
    this.seqNums = this.seqNums
      .slice(0, startIdx)
      .concat(map(toInsert_range, () => this.contextSequenceNum))
      .concat(this.seqNums.slice(startIdx + deleteCount));
  }

  tapKey(event: TapKey) {
    let cursorPos = this.curText.length;
    let oldCurWord = this.curText.slice(this.lastSpaceIdx + 1);

    let isNonWord = !!event.key.match(/\W/);
    let deleteSpace = this.lastSpaceWasAuto && isNonWord;
    let toInsert = event.key;
    let taps = [{ x: event.x, y: event.y }];
    let autoSpace = isNonWord && !(event.key.match(/[-\s']/));
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
    if (
      this.flags.showRelevanceHints &&
      !isNonWord &&
      curWord.slice(0, oldCurWord.length) === oldCurWord
    ) {
      this.visibleSuggestions.predictions.forEach((pred, slot) => {
        if (pred.words.length === 0) return;
        if (newActiveSuggestion) return;
        if (pred.words[0].slice(0, curWord.length) === curWord) {
          newActiveSuggestion = {
            words: pred.words,
            slot,
            highlightChars: curWord.length,
          };
        }
      });
    }
    this.activeSuggestion = newActiveSuggestion;

    return [];
  }

  tapBackspace(event: TapBackspace) {
    let { delta } = event;
    if (delta === undefined) delta = -1;
    this.spliceText(this.curText.length + delta, -delta, "");
    this.lastSpaceWasAuto = false;
    this.activeSuggestion = null;
    this.electricDeleteLiveChars = null;
    return [];
  }

  handleTapSuggestion(event: TapSuggestion) {
    let { slot, which } = event;
    let tappedSuggestion = this.visibleSuggestions[which][slot];
    let wordToInsert = tappedSuggestion.words[0];
    if (!wordToInsert) return [];
    if (which === "synonyms") {
      // // Replace the _previous_ word.
      // let [startIdx, endIdx] = this.visibleSuggestions["replacement_range"];
      // // Actually, kill all remaining text.
      // endIdx = this.curText.length;
      // let autoSpace = endIdx === this.curText.length;
      // this.spliceText(startIdx, endIdx - startIdx, wordToInsert);
      // if (autoSpace) {
      //   // Add a space.
      //   this.spliceText(this.curText.length, 0, " ");
      // }
      // if (this.curText.slice(-1) === " ") {
      //   this.lastSpaceWasAuto = true;
      // }
    } else {
      if (tappedSuggestion.words.length > 1) {
        this.activeSuggestion = {
          words: tappedSuggestion.words.slice(1),
          slot: slot,
        };
      } else {
        this.activeSuggestion = null;
      }

      let { curWord } = this.getSuggestionContext();
      let charsToDelete = curWord.length;
      let isNonWord = wordToInsert.match(/^\W$/);
      let deleteSpace = this.lastSpaceWasAuto && isNonWord;
      if (deleteSpace) {
        charsToDelete++;
      }
      this.spliceText(
        this.curText.length - charsToDelete,
        charsToDelete,
        wordToInsert + " "
      );
      this.lastSpaceWasAuto = true;
    }
    return [];
  }

  handleUndo(event: Event): Event[] {
    if (this.prevState) {
      this.curText = this.prevState.curText;
      this.tapLocations = this.prevState.tapLocations;
      this.seqNums = this.prevState.seqNums;
      this.activeSuggestion = this.prevState.activeSuggestion;
      this.prevState = null;
    }
    return [];
  }

  handleDeleting(event: Deleting): Event[] {
    let { delta } = event;
    this.electricDeleteLiveChars = Math.min(
      Math.max(0, this.curText.length + delta),
      this.curText.length
    );
    return [];
  }

  updateSuggestions(event: UpdateSuggestions): Event[] {
    let { msg } = event;
    // Only update suggestions if the data is valid.
    if (!msg.result) {
      console.warn("Request failed?");
      return [];
    }
    let { request_id } = msg.result;
    if (request_id === this.contextSequenceNum) {
      this.lastSuggestionsFromServer = msg.result;
    }
    let idx = this.outstandingRequests.indexOf(request_id);
    if (idx !== -1) {
      this.outstandingRequests.splice(idx, 1);
    }
    if (idx !== 0) {
      console.log(
        "warning: outstandingRequests weird: looking for",
        request_id,
        "in",
        this.outstandingRequests
      );
    }
    return [];
  }

  init() {
    this.outstandingRequests.push(0);
    return this.getSuggestionRequest();
  }

  getSuggestionRequest() {
    let { prefix, curWord, promise } = this.getSuggestionContext();

    let stimulus = {
      type: this.stimulus.type,
      content: this.flags.modelSeesStimulus ? this.stimulus.content : null,
    };

    return {
      type: "rpc",
      rpc: {
        method: "get_rec",
        stimulus: stimulus,
        sofar: prefix,
        cur_word: curWord,
        flags: { ...this.flags.requestFlags, promise },
        request_id: this.contextSequenceNum,
      },
    };
  }

  getSuggestionContext() {
    return this.suggestionContext;
  }

  getTranscriptionStatus() {
    let curText = this.curText.trim();
    let transcribe = this.flags.transcribe;
    if (!transcribe) return null;
    transcribe = transcribe.trim();

    // Get longest common prefix between curText and transcribe
    let prefixLength = 0;
    while (prefixLength < transcribe.length) {
      if (curText[prefixLength] === transcribe[prefixLength]) {
        prefixLength++;
      } else {
        break;
      }
    }

    let isCorrectSoFar = curText.length === prefixLength;
    let result = {
      commonPrefix: transcribe.slice(0, prefixLength),
      incorrect: '',
      todo: ''
    };
    if (isCorrectSoFar) {
      result.todo = transcribe.slice(curText.length);
    } else {
      result.incorrect = transcribe.slice(prefixLength);
    }
    return result;
  }

  countEvent(eventType: string) {
    this.eventCounts[eventType] = (this.eventCounts[eventType] || 0) + 1;
  }

  handleEvent(event: Event): Event[] {
    let prevState = {
      curText: this.curText,
      tapLocations: this.tapLocations.slice(),
      seqNums: this.seqNums.slice(),
      activeSuggestion: this.activeSuggestion,
    };
    let sideEffects = (() => {
      switch (event.type) {
        case "undo":
          return this.handleUndo(event);
        case "tapKey":
          this.countEvent('tapKey');
          return this.tapKey(event);
        case "tapBackspace":
          this.countEvent('tapBackspace');
          return this.tapBackspace(event);
        case "tapSuggestion":
          let typ = this.hasPartialWord ? 'partial' : 'full';
          this.countEvent(`tapSugg_${typ}`);
          return this.handleTapSuggestion(event);
        case "backendReply":
          return this.updateSuggestions(event);
        case "updateDeleting":
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
  }
}

decorate(ExperimentStateStore, {
  curText: observable,
  contextSequenceNum: observable,
  lastSuggestionsFromServer: observable,
  activeSuggestion: observable,
  lastSpaceWasAuto: observable,
  electricDeleteLiveChars: observable,

  wordCount: computed,
  visibleSuggestions: computed,
  lastSpaceIdx: computed,
  suggestionContext: computed,
  hasPartialWord: computed,
  showPredictions: computed,

  spliceText: action.bound,
  tapKey: action.bound,
  tapBackspace: action.bound,
  handleTapSuggestion: action.bound,
  handleUndo: action.bound,
  updateSuggestions: action.bound,
  handleDeleting: action.bound,
  handleEvent: action.bound,
});
