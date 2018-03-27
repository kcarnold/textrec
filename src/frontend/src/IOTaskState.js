// @flow

import * as M from 'mobx';
import type { ObservableMap } from 'mobx';
import {ExperimentStateStore} from './IOExperimentState';
import TutorialTasks from './TutorialTasks';
import {seededShuffle} from './shuffle';

import type {Event} from './Events';
import type {Stimulus} from './IOExperimentState';

type Screen = {
  screen: string,
  preEvent?: Object,
  timer?: number,
};

type Condition = {
  requestFlags: Object,
};

type Experiment = {
  handleEvent: (event: Event) => Event[],
};

const namedConditions = {
  tutorial: {
    requestFlags: {},
    modelSeesStimulus: true,
  },
  general: {
    requestFlags: {},
    modelSeesStimulus: false,
  },
  specific: {
    requestFlags: {},
    modelSeesStimulus: true,
  }
}


export function experimentBlock(block:number, conditionName: string): Array<Screen> {
  return [
    {preEvent: {type: 'setupExperiment', block, condition: conditionName, name: `final-${block}`}, screen: 'Instructions'},
    {screen: 'ExperimentScreen', instructionsScreen: 'SummaryInstructions'},
    {screen: 'PostTaskSurvey'},
  ];
}

type Config = {
  clientId: string,
  getScreens: (conditions: string[]) => Screen[],
  baseConditions: string[],
  baseStimuli: Stimulus[],
  timeEstimate: string,
};

export class MasterStateStore {
  clientId: string;
  config: Config;
  participantCode: ?string;
  conditions: Array<string>;
  lastEventTimestamp: number;
  replaying: boolean;

  phoneSize: {width: number, height: number};
  pingTime: number;

  // Screens
  screenNum: number;
  screenTimes: Array<{num: number, timestamp: number}>;
  screens: Array<Screen>;

  // Experiments
  experiments: ObservableMap<*>;
  block: number;
  curExperiment: string;
  experimentState: Experiment;
  conditionName: string;
  timerDur: number;
  timerStartedAt: number;

  controlledInputs: ObservableMap<*>;

  tutorialTasks: TutorialTasks;

  stimuli: Stimulus[];

  // Demo handling
  isDemo: boolean;
  demoConditionName: string;

  doInit(configName:string) {
    this.conditions = seededShuffle(`${this.clientId}-conditions`, this.config.baseConditions);
    this.screenNum = 0;
  }

  constructor(config: Config) {
    this.clientId = config.clientId;
    this.config = config;

    let isDemo = (this.clientId || '').slice(0, 4) === 'demo';
    this.isDemo = isDemo;
    this.demoConditionName = this.clientId.slice(4);

    this.stimuli = seededShuffle(`${this.clientId}-stimuli`, this.config.baseStimuli);

    M.extendObservable(this, {
      participantCode: null,
      get isHDSL() {
        return this.participantCode !== null && this.participantCode.slice(0, 4) === 'sona';
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
      conditions: null,
      conditionName: null,
      experiments: M.observable.shallowMap({}),
      curExperiment: null,
      get experimentState() {
        if (this.curExperiment) {
          return this.experiments.get(this.curExperiment);
        }
      },
      controlledInputs: M.observable.shallowMap({}),
      timerStartedAt: null,
      timerDur: null,
      tutorialTasks: null,
      screenTimes: [],
      phoneSize: {width: 360, height: 500},
      pingTime: null,
      get screens() {
        if (isDemo) {
          return [{
            preEvent: {type: 'setupExperiment', block: 0, condition: this.demoConditionName, name: 'demo'},
            screen: 'ExperimentScreen', instructionsScreen: 'SummaryInstructions'
          }];
        }
        return this.config.getScreens(this.conditions);
      },
      get curScreen() {
        return this.screens[this.screenNum];
      },
      get condition() {
        console.assert(!!this.conditionName);
        console.assert(this.conditionName in namedConditions);
        return {...namedConditions[this.conditionName]};
      },
      get timeEstimate() {
        return this.config.timeEstimate;
      }
    });
  }

  initScreen() {
    // Execute start-of-screen actions.
    let sideEffects = [];
    let screen = this.screens[this.screenNum];
    if (screen.preEvent) {
      let {preEvent} = screen;
      switch (preEvent.type) {
      case 'setupExperiment':
        this.conditionName = preEvent.condition;
        this.curExperiment = preEvent.name;
        this.block = preEvent.block;

        let experimentObj = new ExperimentStateStore({
          stimulus: this.stimuli[preEvent.block],
          ...this.condition,
          ...(preEvent.extraFlags || {})
        });
        this.experiments.set(preEvent.name, experimentObj);
        let initReq = experimentObj.init();
        if (initReq)
          sideEffects.push(initReq);
        this.tutorialTasks = new TutorialTasks();
        break;
      default:
      }
    }
    // FIXME: This doesn't get the correct time for the Welcome screen, because the login event doesn't have a jsTimestamp.
    this.screenTimes.push({num: this.screenNum, timestamp: this.lastEventTimestamp});
    if (screen.timer) {
      this.timerStartedAt = this.lastEventTimestamp;
      this.timerDur = screen.timer;
    }
    return sideEffects;
  }

  handleEvent = M.action((event) => {
    let sideEffects = [];
    this.lastEventTimestamp = event.jsTimestamp;
    if (this.experimentState) {
      let res = this.experimentState.handleEvent(event);
      if (res) sideEffects = sideEffects.concat(res);
    }
    if (this.tutorialTasks) {
      this.tutorialTasks.handleEvent(event);
    }

    let screenAtStart = this.screenNum;
    switch (event.type) {
    case 'login':
      this.doInit(event.config);
      if (event.platform_id) {
        this.participantCode = event.platform_id;
      }
      break;
    case 'next':
      this.screenNum++;
      break;
    case 'setScreen':
      this.screenNum = event.screen;
      break;
    case 'controlledInputChanged':
      this.controlledInputs.set(event.name, event.value);
      break;
    case 'resized':
      if (event.kind === 'p') {
        this.phoneSize = {width: event.width, height: event.height};
      }
      if (this.isDemo && !this.experimentState) {
        this.doInit('demo');
        this.pingTime = 0;
      }
    break;
    case 'pingResults':
      if (event.kind === 'p') {
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
