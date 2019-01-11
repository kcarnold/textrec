import type { ObservableMap } from "mobx";

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
};

type Config = {
  clientId: string,
  screens: Screen[],
  timeEstimate: string,
  createExperimentState: (flags: Object) => ExperimentState,
  handleEvent?: (event: Event) => SideEffects,
};


  clientId: string;
  config: Config;
  participantCode: ?string;
  platform: string;
  lastEventTimestamp: number;
  replaying: boolean;

  phoneSize: { width: number, height: number };
  pingTime: number;

  // Screens
  screenNum: number;
  screenTimes: Array<{ num: number, timestamp: number }>;
  screens: Array<Screen>;

  // Experiments
  experiments: ObservableMap<string, ExperimentState>;
  block: number;
  curExperiment: string;
  experimentState: ExperimentState;
  timerDur: number;
  timerStartedAt: number;

  controlledInputs: ObservableMap<string, any>;

  tutorialTasks: TutorialTasks;
