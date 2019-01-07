/** @format */
import { extendObservable, decorate, observable, action } from "mobx";

export class TrialState {
  constructor(flags) {
    this.flags = flags;
    extendObservable(this, {
      curText: "",
      range: { start: 0, end: 0 },
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
    } else if (event.type === "setSuggestion") {
      this.suggestions[event.idx].text = event.text;
    }
  }
}

decorate(TrialState, {
  curText: observable,

  handleEvent: action.bound,
});
