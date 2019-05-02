/** @format */
import { extendObservable, decorate, action } from "mobx";
import isEqual from "lodash/isEqual";

const rpc = (method, params) => ({
  type: "rpc",
  rpc: {
    method,
    ...params,
  },
});

export class TrialState {
  constructor(flags) {
    this.flags = flags;
    extendObservable(this, {
      ideas: [],
      _suggestions: [],
      suggestions: [],
      allowSubmit: false,
    });
  }

  init() {
    return this.getCueRequest();
  }

  getCueRequest() {
    let { recType, domain } = this.flags;
    return rpc("get_cue", {
      domain,
      recType,
      text: this.ideas.map(x => x + ".").join("\n"),
    });
  }

  handleEvent(event) {
    let prevCueRequest = this.getCueRequest();

    let sideEffects = [];
    if (event.type === "addIdea") {
      this.ideas.push(event.idea);
    } else if (event.type === "backendReply") {
      // TODO: ignore other backend replies.
      if (event.msg.result) {
        if (event.msg.result.cues) {
          this._suggestions = event.msg.result.cues.map(cue => ({
            ...cue,
          }));
        }
      }
    } else if (event.type === "inspireMe") {
      this.suggestions = this._suggestions;
    } else if (event.type === "allowSubmit") {
      this.allowSubmit = true;
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
      ideas: this.ideas,
    };
  }
}

decorate(TrialState, {
  handleEvent: action.bound,
});
