/**
 * @format
 * @flow
 */

/**
This is the top-level state for an experiment. It handles a large amount of configuration and state:

 Configuration:
  - participant id (called clientId for historical reasons)
  - task configuration: screen list, time estimate, etc.
  - platform code (e.g., MTurk, HDSL, ...)

 State:
  - flag for whether we're replaying events
  - which screen we're on
  - tutorial tasks
  - "controlled inputs" - <input> or <textarea> values for survey responses.

It also manages a collection of trial states, called "experiment states" for historical reasons.
Each trial has a name. There's a notion of a current trial.
 */

import { extendObservable, observable, computed, action, toJS } from "mobx";
import type { ObservableMap } from "mobx";
import TutorialTasks from "./TutorialTasks";

import type { Event, SideEffects } from "./Events";

export type Screen = {
  screen: string,
  view?: any,
  preEvent?: Object,
  timer?: number,
};

type ExperimentState = {
  +handleEvent: (event: Event) => SideEffects,
  curText: string,
  flags: Object,
  transcribe: ?string,
};

type Config = {
  clientId: string,
  screens: Screen[],
  timeEstimate: string,
  createExperimentState: (flags: Object) => ExperimentState,
  handleEvent?: (event: Event) => SideEffects,
};

function handleEvent(state, event) {
  let sideEffects = [];
  state.eventHandlers.forEach(fn => {
    let res = fn(state, event) || [];
    if (res.length) {
      sideEffects = sideEffects.concat(res);
    }
  });

  state.lastEventTimestamp = event.jsTimestamp;
  if (state.experimentState) {
    let res = state.experimentState.handleEvent(event);
    if (res) sideEffects = sideEffects.concat(res);
  }
  if (state.tutorialTasks) {
    state.tutorialTasks.handleEvent(event);
  }
  if (state.config.handleEvent) {
    let res = state.config.handleEvent(event);
    if (res) sideEffects = sideEffects.concat(res);
  }

  let screenAtStart = state.screenNum;
  switch (event.type) {
    case "login":
      state.screenNum = 0;
      break;
    case "next":
      state.screenNum += event.delta == null ? 1 : event.delta;
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
}

function initScreen(state) {
  // Execute start-of-screen actions.
  let sideEffects = [];
  let screen = state.screens[state.screenNum];
  if (screen.preEvent) {
    let { preEvent } = screen;
    if (preEvent.type === "setupExperiment") {
      let initReq = setupExperiment(state, preEvent);
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

function setupExperiment(state, preEvent) {
  state.curExperiment = preEvent.name;
  let experimentObj = state.config.createExperimentState(preEvent.flags);
  state.experiments.set(preEvent.name, experimentObj);
  state.tutorialTasks = new TutorialTasks();
  return experimentObj.init();
}

class MasterStateStore {
  constructor(config: Config) {
    this.clientId = config.clientId;
    this.config = config;
    this.screens = config.screens;
    this.eventHandlers = [];

    extendObservable(this, {
      handleEvent: action(event => handleEvent(this, event)),
      lastEventTimestamp: null,
      replaying: true,
      screenNum: null,
      block: null,
      experiments: observable.map({}, { deep: false }),
      curExperiment: null,
      get experimentState() {
        if (this.curExperiment) {
          return this.experiments.get(this.curExperiment);
        }
      },
      timerStartedAt: null,
      timerDur: null,
      tutorialTasks: null,
      screenTimes: [],
      get curScreen() {
        return this.screens[this.screenNum];
      },
      get timeEstimate() {
        return this.config.timeEstimate;
      },
    });
  }
}

const platformTracking = state => {
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

const pingTracking = state => {
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

const sizeTracking = state => {
  extendObservable(state, { phoneSize: { width: 360, height: 500 } });
  state.eventHandlers.push((state, event) => {
    if (event.type === "resized") {
      if (event.kind === "p") {
        state.phoneSize = { width: event.width, height: event.height };
      }
    }
  });
};

const controlledInputsTracking = state => {
  extendObservable(state, {
    controlledInputs: observable.map({}, { deep: false }),
  });
  state.eventHandlers.push((state, event) => {
    if (event.type === "controlledInputChanged") {
      state.controlledInputs.set(event.name, event.value);
    }
  });
};

export function createState(config: Config) {
  let state = new MasterStateStore(config);
  platformTracking(state);
  pingTracking(state);
  sizeTracking(state);
  controlledInputsTracking(state);
  return state;
}
