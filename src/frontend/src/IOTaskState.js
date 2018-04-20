// @flow

import * as M from "mobx";
import type { ObservableMap } from "mobx";
import { ExperimentStateStore } from "./IOExperimentState";
import TutorialTasks from "./TutorialTasks";

import type { Event } from "./Events";

export type Screen = {
  screen: string,
  view?: any,
  preEvent?: Object,
  timer?: number,
};

type Experiment = {
  handleEvent: (event: Event) => Event[],
};

type Config = {
  clientId: string,
  screens: Screen[],
  timeEstimate: string,
  handleEvent?: (event: Event) => Event[]
};

export function getDemoConditionName(clientId: string): ?string {
  if (clientId.slice(0, 4) === "demo") {
    return clientId.slice(4);
  }
  return null;
}

export class MasterStateStore {
  clientId: string;
  config: Config;
  participantCode: ?string;
  lastEventTimestamp: number;
  replaying: boolean;

  phoneSize: { width: number, height: number };
  pingTime: number;

  // Screens
  screenNum: number;
  screenTimes: Array<{ num: number, timestamp: number }>;
  screens: Array<Screen>;

  // Experiments
  experiments: ObservableMap<*>;
  block: number;
  curExperiment: string;
  experimentState: Experiment;
  timerDur: number;
  timerStartedAt: number;

  controlledInputs: ObservableMap<*>;

  tutorialTasks: TutorialTasks;

  doInit() {
    this.screenNum = 0;
  }

  constructor(config: Config) {
    this.clientId = config.clientId;
    this.config = config;
    this.screens = config.screens;

    M.extendObservable(this, {
      participantCode: null,
      get isHDSL() {
        return (
          this.participantCode !== null &&
          this.participantCode.slice(0, 4) === "sona"
        );
      },
      get sonaCreditLink() {
        console.assert(this.isHDSL);
        let survey_code = this.participantCode.slice(4);
        return `https://harvarddecisionlab.sona-systems.com/webstudy_credit.aspx?experiment_id=440&credit_token=2093214a21504aae88bd36405e5a4e08&survey_code=${survey_code}`;
      },
      get isMTurk() {
        return !this.isHDSL;
      },
      lastEventTimestamp: null,
      replaying: true,
      screenNum: null,
      block: null,
      experiments: M.observable.map({}, { deep: false }),
      curExperiment: null,
      get experimentState() {
        if (this.curExperiment) {
          return this.experiments.get(this.curExperiment);
        }
      },
      controlledInputs: M.observable.map({}, { deep: false }),
      timerStartedAt: null,
      timerDur: null,
      tutorialTasks: null,
      screenTimes: [],
      phoneSize: { width: 360, height: 500 },
      pingTime: null,
      get curScreen() {
        return this.screens[this.screenNum];
      },
      get timeEstimate() {
        return this.config.timeEstimate;
      },
    });
  }

  initScreen() {
    // Execute start-of-screen actions.
    let sideEffects = [];
    let screen = this.screens[this.screenNum];
    if (screen.preEvent) {
      let { preEvent } = screen;
      switch (preEvent.type) {
        case "setupExperiment":
          this.curExperiment = preEvent.name;

          let experimentObj = new ExperimentStateStore(preEvent.flags);
          this.experiments.set(preEvent.name, experimentObj);
          let initReq = experimentObj.init();
          if (initReq) sideEffects.push(initReq);
          this.tutorialTasks = new TutorialTasks();
          break;
        default:
      }
    }
    this.screenTimes.push({
      num: this.screenNum,
      timestamp: this.lastEventTimestamp,
    });
    if (screen.timer) {
      this.timerStartedAt = this.lastEventTimestamp;
      this.timerDur = screen.timer;
    }
    return sideEffects;
  }

  handleEvent = M.action(event => {
    let sideEffects = [];
    this.lastEventTimestamp = event.jsTimestamp;
    if (this.experimentState) {
      let res = this.experimentState.handleEvent(event);
      if (res) sideEffects = sideEffects.concat(res);
    }
    if (this.tutorialTasks) {
      this.tutorialTasks.handleEvent(event);
    }
    if (this.config.handleEvent) {
      let res = this.config.handleEvent(event);
      if (res) sideEffects = sideEffects.concat(res);
    }

    let screenAtStart = this.screenNum;
    switch (event.type) {
      case "login":
        this.doInit();
        if (event.platform_id) {
          this.participantCode = event.platform_id;
        }
        break;
      case "next":
        this.screenNum++;
        break;
      case "setScreen":
        this.screenNum = event.screen;
        break;
      case "controlledInputChanged":
        this.controlledInputs.set(event.name, event.value);
        break;
      case "resized":
        if (event.kind === "p") {
          this.phoneSize = { width: event.width, height: event.height };
        }
        if (this.screenNum === null) {
          console.warn("Force init, should only happen for demo.");
          this.doInit();
          this.pingTime = 0;
        }
        break;
      case "pingResults":
        if (event.kind === "p") {
          this.pingTime = event.ping.mean;
        }
        break;

      default:
    }

    if (this.screenNum !== screenAtStart) {
      sideEffects = sideEffects.concat(this.initScreen());
    }
    return sideEffects;
  });
}
