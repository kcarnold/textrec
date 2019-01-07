/** @format */
import { extendObservable, decorate, observable, action } from "mobx";

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
    return [];
  }

  handleEvent(event) {
    if (event.type === "setText") {
      this.curText = event.text;
      this.range = event.range;
      this.caret = event.caret;
    } else if (event.type === "setSuggestion") {
      this.suggestions[event.idx].text = event.text;
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
  }
}

decorate(TrialState, {
  curText: observable,

  handleEvent: action.bound,
});
