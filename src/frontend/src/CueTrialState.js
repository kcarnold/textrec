/** @format */
import { extendObservable, decorate, observable, action, computed } from "mobx";
import isEqual from "lodash/isEqual";
import countWords from "./CountWords";

const rpc = (method, params) => ({
  type: "rpc",
  rpc: {
    method,
    ...params,
  },
});

const emptySuggestions = [{ text: "" }, { text: "" }, { text: "" }];

export class TrialState {
  constructor(flags) {
    this.flags = flags;
    extendObservable(this, {
      curText: "",
      range: { start: 0, end: 0 },
      caret: null,
      staticCues: null,
      get suggestions() {
        let shouldShow = true;
        if (flags.onRequest && !this.writerRequestedCues) shouldShow = false;
        if (shouldShow) {
          return this._suggestions;
        } else {
          return emptySuggestions;
        }
      },
      _suggestions: emptySuggestions,
      writerRequestedCues: false,
      get wordCount() {
        return countWords(this.curText);
      },
    });
  }

  init() {
    return this.getCueRequest();
  }

  getCueRequest() {
    let { recType, domain } = this.flags;
    if (recType === "randomPhrases" || recType === "randomSentences") {
      if (this.curText === "") {
        return rpc("get_cue", { domain, recType });
      }
    }
    return rpc("get_cue", { domain, recType, text: this.curText });
  }

  get numFinishedSents() {
    // OR: https://www.npmjs.com/package/sentence-splitter
    return (this.curText.replace(/\.{3,}/, " _ELLIPS_ ").match(/[.?!]+/g) || [])
      .length;
  }

  handleEvent(event) {
    let prevCueRequest = this.getCueRequest();

    let sideEffects = [];
    if (event.type === "setText") {
      this.curText = event.text;
      this.range = event.range;
      this.caret = event.caret;
    } else if (event.type === "setSuggestion") {
      this._suggestions[event.idx].text = event.text;
    } else if (event.type === "backendReply") {
      // TODO: ignore other backend replies.
      if (event.msg.result) {
        if (event.msg.result.cues) {
          this._suggestions = event.msg.result.cues.map(cue => ({
            text: cue.phrase,
          }));
        } else if (event.msg.result.staticCues) {
          this.staticCues = event.msg.result.staticCues;
        }
      }
    } else if (event.type === "insertSugWord") {
      let { curText, range, suggestions } = this;
      if (suggestions.length && suggestions[0].text.length) {
        let { text } = suggestions[0];
        let words = text.match(/^(\w+)(.*)/);
        if (words) {
          let word = words[1];
          let { start, end } = range;
          let toInsert = word + " ";
          let newText = curText.slice(0, start) + toInsert + curText.slice(end);
          let newPos = start + toInsert.length;
          let newRange = { start: newPos, end: newPos };
          this.curText = newText;
          this.range = newRange;
          this._suggestions = [{ text: words[2].trim() }];
        }
      }
    } else if (event.type === "toggleInspiration") {
      this.writerRequestedCues = !this.writerRequestedCues;
    }

    let newCueRequest = this.getCueRequest();
    if (newCueRequest && !isEqual(prevCueRequest, newCueRequest)) {
      sideEffects.push(newCueRequest);
    }

    return sideEffects;
  }

  getSerialized() {
    return {
      condition: this.flags.condition,
      text: this.curText,
    };
  }
}

decorate(TrialState, {
  curText: observable,

  numFinishedSents: computed,
  wordCount: computed,
  suggestions: computed,

  handleEvent: action.bound,
});
