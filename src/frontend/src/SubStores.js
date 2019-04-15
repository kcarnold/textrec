/**
 * @format
 */

import { extendObservable, observable } from "mobx";

export const platformTracking = state => {
  extendObservable(state, {
    participantCode: null,
    platform: null,
    get sonaCreditLink() {
      console.assert(this.platform === "sona");
      // participant codes look like `sonaXXX`, where XXX is the survey code.
      let survey_code = this.participantCode.slice(4);
      return `https://harvarddecisionlab.sona-systems.com/webstudy_credit.aspx?experiment_id=440&credit_token=2093214a21504aae88bd36405e5a4e08&survey_code=${survey_code}`;
    },
  });
  state.eventHandlers.push((state, event) => {
    if (event.type === "login") {
      if (event.platform_id) {
        state.participantCode = event.platform_id;
      }
      if (event.src === "amt") {
        state.platform = "turk";
      }
      if (event.src === "sona") {
        state.platform = "sona";
      }
    }
  });
};

export const pingTracking = state => {
  extendObservable(state, {
    pingTime: null,
  });
  state.eventHandlers.push((state, event) => {
    if (event.type === "pingResults") {
      if (event.kind === "p") {
        state.pingTime = event.ping.mean;
      }
    }
  });
};

export const sizeTracking = state => {
  extendObservable(state, { phoneSize: { width: 360, height: 500 } });
  state.eventHandlers.push((state, event) => {
    if (event.type === "resized") {
      if (event.kind === "p") {
        state.phoneSize = { width: event.width, height: event.height };
      }
    }
  });
};

/**
- "controlled inputs" - <input> or <textarea> values for survey responses.
 */
export const controlledInputsTracking = state => {
  extendObservable(state, {
    controlledInputs: observable.map({}, { deep: false }),
  });
  state.eventHandlers.push((state, event) => {
    if (event.type === "controlledInputChanged") {
      state.controlledInputs.set(event.name, event.value);
    }
  });
};

/**
 State:
  - which screen we're on
  
It also manages a collection of trial states, called "experiment states" for historical reasons.
Each trial has a name. There's a notion of a current trial.
 */
export const screenTracking = screens => state => {
  state.screens = screens;
  function initScreen(state) {
    // Execute start-of-screen actions.
    let sideEffects = [];
    let screen = state.screens[state.screenNum];
    if (screen.preEvent) {
      let { preEvent } = screen;
      if (preEvent.type === "setupTrial") {
        let initReq = setupTrial(state, preEvent);
        if (initReq) sideEffects.push(initReq);
      }
    }
    state.screenTimes.push({
      num: state.screenNum,
      timestamp: state.lastEventTimestamp,
    });
    if (screen.timer) {
      state.timerStartedAt = state.lastEventTimestamp;
      state.timerDur = screen.timer;
    }
    return sideEffects;
  }

  function setupTrial(state, preEvent) {
    state.curExperiment = preEvent.name;
    let experimentObj = state.config.createExperimentState(preEvent.flags);
    state.experiments.set(preEvent.name, experimentObj);
    return experimentObj.init();
  }

  extendObservable(state, {
    screenNum: null,
    block: null,
    experiments: observable.map({}, { deep: false }),
    curExperiment: null,
    get experimentState() {
      if (this.curExperiment) {
        return this.experiments.get(this.curExperiment);
      }
      return null;
    },
    timerStartedAt: null,
    timerDur: null,
    screenTimes: [],
    get curScreen() {
      return this.screens[this.screenNum];
    },
  });
  state.eventHandlers.push((state, event) => {
    let sideEffects = [];
    if (state.experimentState) {
      let res = state.experimentState.handleEvent(event);
      if (res) sideEffects = sideEffects.concat(res);
    }

    let screenAtStart = state.screenNum;
    switch (event.type) {
      case "login":
        state.screenNum = 0;
        break;
      case "next":
        state.screenNum = Math.min(
          state.screens.length - 1,
          Math.max(0, state.screenNum + (event.delta == null ? 1 : event.delta))
        );
        break;
      case "setScreen":
        state.screenNum = event.screen;
        break;
      default:
    }

    if (state.screenNum !== screenAtStart) {
      sideEffects = sideEffects.concat(initScreen(state));
    }
    return sideEffects;
  });
};
