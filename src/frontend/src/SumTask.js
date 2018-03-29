// @flow
import React from 'react';

import * as IOTaskState from './IOTaskState';
import * as Views from './IOViews';

let baseStimuli = [
"cambodian leader hun sen on friday rejected opposition parties ' demands for talks outside the country , accusing them of trying to `` internationalize '' the political crisis .",
"honduras braced for potential catastrophe tuesday as hurricane mitch roared through the northwest caribbean , churning up high waves and intense rain that sent coastal residents scurrying for safer ground .",
"cuban president fidel castro said sunday he disagreed with the arrest in london of former chilean dictator augusto pinochet , calling it a case of `` international meddling . ''",
"u.s. prosecutors have asked for a 20-day extension to provide germany with paperwork necessary to extradite a top lieutenant of saudi terrorist suspect osama bin laden , officials said saturday .",
].map(content => ({type: 'doc', content}));


let tutorialStimuli = [
  {
    stimulus: {type: 'doc', content: null},
    transcribe: "opposition asks end to loans to \"illegal\" cambodian government",
  },
  {
    stimulus: {type: 'doc', content: null},
    transcribe: "aid rushed to devastated victims of hurricane mitch",
  }
];

function experimentBlock(block:number, conditionName: string): Array<Screen> {
  return [
    {preEvent: {type: 'setupExperiment', block, condition: conditionName, name: `final-${block}`}, screen: 'Instructions'},
    {screen: 'ExperimentScreen', instructionsScreen: 'SummaryInstructions'},
    {screen: 'PostTaskSurvey'},
  ];
}

function getScreens(conditions: string[]) {
  let tutorials = tutorialStimuli.map(({stimulus, transcribe}, idx) => (
    {
      preEvent: {
        type: 'setupExperiment',
        block: 0,
        condition: 'general',
        name: `practice-${idx}`,
        extraFlags: {
          transcribe: transcribe.toLowerCase(),
          stimulus},
      },
      screen: 'ExperimentScreen', instructionsScreen: 'TranscribeTask'
    }));
  let result = [
    {controllerScreen: 'Welcome', screen: 'Welcome'},
    {screen: "IntroSurvey"},
    ...tutorials,
    {screen: "TaskDescription"},
  ];
  conditions.forEach((condition, idx) => {
    result = result.concat(experimentBlock(idx, condition));
  });
  result = result.concat([
    {screen: 'PostExpSurvey'},
    {screen: 'Done'},
  ]);
  return result;
}

let baseConditions = ['norecs', 'general', 'specific'];

export function createTaskState(clientId:string) {
  return new IOTaskState.MasterStateStore({
    clientId,
    getScreens,
    baseConditions,
    baseStimuli,
    timeEstimate: '20 minutes',
  });
}

export function screenToView(screenDesc: Screen) {
  let screenName = screenDesc.screen;
  console.assert(screenName in Views);
  return React.createElement(Views[screenName]);
}
