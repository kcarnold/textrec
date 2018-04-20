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
  { type: "img", content: "000000275075" }
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
    transcribe: "a grilled pizza with chicken, broccoli and cheese."
  }
];


const namedConditions = {
  norecs: {
    requestFlags: {},
    modelSeesStimulus: false,
    hideRecs: true
  },
  tutorial: {
    requestFlags: {},
    modelSeesStimulus: true
  },
  general: {
    requestFlags: {},
    modelSeesStimulus: false
  },
  specific: {
    requestFlags: {},
    modelSeesStimulus: true
  }
};




const urlForImage = content => {
  console.assert(content.length === 12);
  return `http://images.cocodataset.org/train2017/${content}.jpg`;
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
        <img src={urlForImage(stimulus.content)} style={{ width: "100%" }} alt="(image to caption should display here)" />
      </div>
    );
  }
};

const CapInstructions = iobs(({ state }) => (
  <div>
    Write the most specific description you can for the image below. Write only
    a single sentence. After you're done, tap here:{" "}
    <NextBtn disabled={state.experimentState.wordCount < 10} />
    <StimulusView stimulus={state.experimentState.stimulus} />
  </div>
));

function experimentBlock(block: number, conditionName: string, stimuli: Stimulus[]): Array<Screen> {
  let agreeLikert = (name, prompt) => likert(name, prompt, 7, ["Strongly disagree", "Strongly agree"]);
  let designQuestions = [
    agreeLikert("sys-specific", "This keyboard design helped me write captions that were very specific"),
    agreeLikert("sys-accurate", "This keyboard design helped me write captions that were very accurate"),
    agreeLikert("sys-fast", "This keyboard design helped me write captions quickly"),
  ];
  return [
    {
      screen: "Instructions",
      view: () => <div>
        About to start using
        <h1>Keyboard {block + 1}</h1>
        Tap Next when ready: <NextBtn />
      </div>
    },
    ...stimuli.map((stimulus, idx) => ({
        preEvent: {
          type: "setupExperiment",
          block,
          condition: conditionName,
          name: `final-${block}-${idx}`,
          flags: {
            ...namedConditions[conditionName],
            stimulus
          }
        },
        screen: "ExperimentScreen",
        type: "experiment",
        instructions: CapInstructions
    })),
    {
      screen: "PostTaskSurvey",
      type: "survey",
      props: {
        title: "After-Writing Survey",
        basename: `postTask-${block}`,
        questions: [
          // likert("specific", "How specific was the caption you wrote?", 7, [
          //   "Very generic",
          //   "Very specific"
          // ]),
          ...designQuestions,
          ...tlxQuestions,
          // ...personalityBlock(block + 1),
          ...miscQuestions
        ]
      }
    }
  ];
}

function getDemoScreens(condition: string, stimulus: Stimulus) {
  return [
    {
      preEvent: {
        type: "setupExperiment",
        block: 0,
        condition,
        name: `final-0`,
        flags: {
          ...namedConditions[condition],
          stimulus
        }
      },
      screen: "ExperimentScreen",
      type: "experiment",
      instructions: CapInstructions
    }
  ];
}

function getScreens(conditions: string[], stimuli: Stimulus[]) {
  let tutorials = tutorialStimuli.map(({ stimulus, transcribe }, idx) => ({
    preEvent: {
      type: "setupExperiment",
      block: 0,
      condition: "general",
      name: `practice-${idx}`,
      flags: {
        ...namedConditions['general'],
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
          study. A few quick notes about the keyboard:
        </p>
        <ul>
          <li>It's simplified: no caps, and only a few extra symbols.</li>
          <li>
            You can't edit text you've already entered, other than by deleting
            and retyping it. Sorry.
          </li>
          <li>Autocorrect doesn't work. Please try to avoid typos.</li>
          <li>
            <b>but</b>, on the upside, there are some special things about the
            predictive typing! The predictive typing will work a little
            differently in different parts of the study.
          </li>
        </ul>
        <p>
          <b>
            We'll type a few sentences to start off so you get used to it. Type
            this:
          </b>
          <br />
          <div style={{ background: "white" }}>
            {state.experimentState.transcribe}
          </div>
        </p>
        <NextBtn />
      </div>
    ))
  }));

  // Group stimuli by block.
  console.assert(stimuli.length === conditions.length * TRIALS_PER_CONDITION);
  let blocks = conditions.map((condition, idx) => ({
    condition,
    stimuli: stimuli.slice(idx * TRIALS_PER_CONDITION).slice(0, TRIALS_PER_CONDITION)
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
          }

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
  blocks.forEach((block, idx) => {
    result = result.concat(experimentBlock(idx, block.condition, block.stimuli));
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
  clientId = clientId || "";

  let screens, stimuli;
  let demoConditionName = IOTaskState.getDemoConditionName(clientId);
  if (demoConditionName !== null) {
    screens = getDemoScreens(demoConditionName, baseStimuli[0]);
  } else {
    let conditions = seededShuffle(`${clientId}-conditions`, baseConditions);
    stimuli = seededShuffle(`${clientId}-stimuli`, baseStimuli);
    screens = getScreens(conditions, stimuli);
  }

  return new IOTaskState.MasterStateStore({
    clientId,
    screens,
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
