import React from 'react';

import * as IOTaskState from './IOTaskState';
import * as Views from './IOViews';


let baseStimuli = [
  {type: 'img', content: '000000025994'},
  {type: 'img', content: '000000030711'},
  {type: 'img', content: '000000102555'},
]


let tutorialStimuli = [
  {
    stimulus: {type: 'img', content: '000000099807'},
    transcribe: "a woman near her cross country skies and her two golden retrievers",
  },
  {
    stimulus: {type: 'img', content: '0000000216407'},
    transcribe: "a man with a backpack and a puppy inside it while on skis.",
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
