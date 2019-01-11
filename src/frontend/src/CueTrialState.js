/** @format */
import { extendObservable, decorate, observable, action, computed } from "mobx";
import isEqual from "lodash/isEqual";

export class TrialState {
  constructor(flags) {
    this.flags = flags;
    extendObservable(this, {
      curText: "",
      range: { start: 0, end: 0 },
      caret: null,
      suggestions: [{ text: "" }, { text: "" }, { text: "" }],
    });
  }

  init() {
    return this.getCueRequest();
  }

  getCueRequest() {
    return {
      type: "rpc",
      rpc: {
        method: "get_cue",
        text: this.curText,
      },
    };
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
      this.suggestions[event.idx].text = event.text;
    } else if (event.type === "backendReply") {
      // TODO: ignore other backend replies.
      console.log(event);
      if (event.msg.result && event.msg.result.cues) {
        this.suggestions = event.msg.result.cues.map(cue => ({
          text: cue.phrase,
        }));
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
          this.suggestions = [{ text: words[2].trim() }];
        }
      }
    }

    let newCueRequest = this.getCueRequest();
    if (!isEqual(prevCueRequest, newCueRequest)) {
      sideEffects.push(newCueRequest);
    }

    return sideEffects;
  }
}

decorate(TrialState, {
  curText: observable,

  numFinishedSents: computed,

  handleEvent: action.bound,
});
