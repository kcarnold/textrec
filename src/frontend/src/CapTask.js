import React from "react";
import { observer, inject } from "mobx-react";

import * as IOTaskState from "./IOTaskState";
import * as Views from "./IOViews";
import { NextBtn } from "./BaseViews";
import { Survey, likert } from "./SurveyViews";
import {
  personalityBlock,
  tlxQuestions,
  miscQuestions,
  closingSurveyQuestions
} from "./SurveyData";

import { seededShuffle } from "./shuffle";

const iobs = fn => inject("state", "dispatch")(observer(fn));


const TRIALS_PER_CONDITION = 2;

let baseStimuli = [
  { type: "img", content: "000000150367" },
  { type: "img", content: "000000524881" },
  { type: "img", content: "000000127298" },
  { type: "img", content: "000000232689" },
  { type: "img", content: "000000283426" },
  { type: "img", content: "000000275075" },
  // { type: "img", content: "000000107610" },
  // { type: "img", content: "000000093272" },
  // { type: "img", content: "000000218224" },
  // { type: "img", content: "000000138629" },
  // { type: "img", content: "000000306670" },
  // { type: "img", content: "000000165203" },
];

let tutorialStimuli = [
  {
    stimulus: { type: "img", content: "000000416308" },
    transcribe: "a group of people on a beach preparing to paraglide."
  },
  {
    stimulus: { type: "img", content: "000000459515" },
    transcribe:
      "a grilled pizza with chicken, broccoli and cheese."
  }
];

const urlForImage = content => {
  console.assert(content.length === 12);
  return `http://images.cocodataset.org/train2017/${content}.jpg`
  // return `http://visualqa.org/data/abstract_v002/scene_img/img/${content}.png`;
};

export const StimulusView = ({ stimulus }) => {
  if (stimulus.type === "doc") {
    return (
      <div
        style={{
          whiteSpace: "pre-line",
          background: "white",
          margin: "5px 2px"
        }}
      >
        {stimulus.content}
      </div>
    );
  } else if (stimulus.type === "img") {
    return (
      <div>
        <img src={urlForImage(stimulus.content)} style={{ width: "100%" }} />
      </div>
    );
  }
};

const SummaryInstructions = iobs(({ state }) => (
  <div>
    Write the most specific description you can for the image below. Write only a single sentence. After
    you're done, tap here:{" "}
    <NextBtn disabled={state.experimentState.wordCount < 10} />
    <StimulusView stimulus={state.experimentState.stimulus} />
  </div>
));

function experimentBlock(block: number, conditionName: string): Array<Screen> {
  let systemQuestions = [];
  if (conditionName !== "norecs") {
    systemQuestions = [
      likert("sys-accurate", "How accurate were the system's predictions?", 7, [
        "Not accurate at all",
        "Extremely accurate"
      ]),
      likert(
        "sys-distracting",
        "How distracting were the system's predictions?",
        7,
        ["Not distracting at all", "Extremely distracting"]
      ),
      likert("sys-helpful", "How helpful were the system's predictions?", 7, [
        "Not helpful at all",
        "Extremely helpful"
      ])
    ];
  }
  return [
    {
      preEvent: {
        type: "setupExperiment",
        block,
        condition: conditionName,
        name: `final-${block}`
      },
      screen: "Instructions"
    },
    {
      screen: "ExperimentScreen",
      type: "experiment",
      instructions: SummaryInstructions
    },
    {
      screen: "PostTaskSurvey",
      type: "survey",
      props: {
        title: "After-Writing Survey",
        basename: `postTask-${block}`,
        questions: [
          likert("specific", "How specific was the caption you wrote?", 7, [
            "Very generic",
            "Very specific"
          ]),
          ...systemQuestions,
          { text: <b>Cognitive Load</b> },
          ...tlxQuestions,
          // ...personalityBlock(block + 1),
          ...miscQuestions
        ]
      }
    }
  ];
}

function getScreens(conditions: string[], isDemo: boolean) {
  if (isDemo) {
    console.assert(conditions.length === 1);
    let condition = conditions[0];
    return [{
      preEvent: {
        type: "setupExperiment",
        block: 0,
        condition,
        name: `final-0`
      },
      screen: "ExperimentScreen",
      type: "experiment",
      instructions: SummaryInstructions
    }];
  }

  let tutorials = tutorialStimuli.map(({ stimulus, transcribe }, idx) => ({
    preEvent: {
      type: "setupExperiment",
      block: 0,
      condition: "general",
      name: `practice-${idx}`,
      extraFlags: {
        transcribe: transcribe.toLowerCase(),
        stimulus
      }
    },
    screen: "ExperimentScreen",
    type: "experiment",
    instructions: iobs(({ state }) => (
      <div>
        <p>
          <b>Warm-up!</b>
        </p>
        <p>
          For technical reasons, we have to use a special keyboard for this
          study. We'll type a few captions to start off so you get used to
          it.
        </p>
        <p>
          <b>Type this:</b>
          <br />
          <div style={{ background: "white" }}>
            {state.experimentState.transcribe}
          </div>
        </p>
        <NextBtn />
      </div>
    ))
  }));
  let result = [
    { controllerScreen: "Welcome", screen: "Welcome" },
    {
      screen: "IntroSurvey",
      type: "survey",
      props: {
        title: "Opening Survey",
        basename: "intro",
        questions: [
          {
            text:
              "There will be several short surveys like this as breaks from the writing task."
          },

          // TODO: should we break this down into prediction, correction, gesture, etc.?
          {
            text: "Do you use predictive typing on your phone?",
            responseType: "options",
            name: "use_predictive",
            options: ["Yes", "No"]
          },

          // ...personalityBlock(0)
        ]
      }
    },
    ...tutorials,
    {
      screen: "TaskDescription",
      view: () => (
        <div>
          <p>
            In this study we're going to be writing descriptions of images. You
            already typed a few of them during the warm-up.
          </p>

          <p>
            Your goal is to write the <b>most specific description</b> you can.
            Someone reading a <b>specific</b> description will be able to pick
            out your image from among a set of similar images.
          </p>

          <NextBtn />
        </div>
      )
    }
  ];
  conditions.forEach((condition, idx) => {
    result = result.concat(experimentBlock(idx, condition));
  });
  result = result.concat([
    {
      screen: "PostExpSurvey",
      type: "survey",
      props: {
        title: "Closing Survey",
        basename: "postExp",
        questions: [...closingSurveyQuestions]
      }
    },
    { screen: "Done" }
  ]);
  return result;
}

let baseConditions = ["norecs", "general", "specific"];

export function createTaskState(clientId: string) {
  let conditionOrder = seededShuffle(`${clientId}-conditions`, baseConditions);

  // Repeat conditions.
  let conditions = [];
  for (let i = 0; i < TRIALS_PER_CONDITION; i++) {
    conditions = [...conditions, ...conditionOrder];
  }

  return new IOTaskState.MasterStateStore({
    clientId,
    getScreens,
    conditions,
    baseStimuli,
    timeEstimate: "20 minutes"
  });
}

export function screenToView(screenDesc: Screen) {
  if (screenDesc.type === "survey") {
    return React.createElement(Survey, screenDesc.props);
  }
  if (screenDesc.type === "experiment") {
    let instructions = React.createElement(screenDesc.instructions);
    return <Views.ExperimentScreen instructions={instructions} />;
  }
  if (screenDesc.view) {
    return React.createElement(screenDesc.view);
  }
  let screenName = screenDesc.screen;
  console.assert(screenName in Views);
  return React.createElement(Views[screenName]);
}
