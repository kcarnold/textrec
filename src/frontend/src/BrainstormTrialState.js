/** @format */
import { extendObservable, decorate, observable, action, computed } from "mobx";
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
    });
  }

  init() {
    return this.getCueRequest();
  }

  getCueRequest() {
    let { recType, domain } = this.flags;
    return rpc("get_cue", { domain, recType, text: this.ideas.join("\n") });
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
            text: cue.phrase,
          }));
        }
      }
    }

    let newCueRequest = this.getCueRequest();
    if (newCueRequest && !isEqual(prevCueRequest, newCueRequest)) {
      sideEffects.push(newCueRequest);
    }

    return sideEffects;
  }
}

decorate(TrialState, {
  handleEvent: action.bound,
});
