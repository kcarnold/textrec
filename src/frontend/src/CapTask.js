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
  let padded = `${content}`;
  while (padded.length < 12) padded = "0" + padded;
  console.assert(padded.length === 12);
  return `http://images.cocodataset.org/train2017/${padded}.jpg`;
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
    Write the most specific and accurate description you can for the image below. After you're done, tap here:{" "}
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
    {
      screen: "TaskDescription",
      view: () => (
        <div>
          <p>
            In this study we're going to be writing captions for images. The captions should be <b>specific</b> and <b>accurate</b>.
          </p>

          <h3>Example</h3>

          <StimulusView stimulus={({type: 'img', content: 395402 })} />

          <ul>
            <li>A dog with a collar is sitting in a carpeted room. &mdash; <b>Not specific.</b></li>
            <li>An alert tricolor dalmation is looking to its left. &mdash; <b>Not accurate.</b></li>
            <li>An alert tricolor terrier is looking to its right. &mdash; <b>Good: both specific and accurate</b></li>
          </ul>

          <p>Why? Other people will be shown your caption and they'll have to pick out the right image from a line-up, like this:</p>

          <StimulusView stimulus={({type: 'img', content: 395402 })} />
          <StimulusView stimulus={({type: 'img', content: 6710 })} />
          <StimulusView stimulus={({type: 'img', content: 250868 })} />


          <p>A bonus of $0.50 will be available to the most specific and accurate captions!</p>

          <h3>Quiz</h3>
          <StimulusView stimulus={({type: 'img', content: 251368 })} />

          <p>Which of the following captions is most likely to get the bonus?</p>

          <ul>
            <li>exactly how are both the dog and the person going to fit on that skateboard?</li>
            <li>the dark haired dog is trying to ride on the skateboard.</li>
            <li>a person in shorts and a black dog both have one foot on a skateboard.</li>
            <li>a guy with a dog trying to climb on a skateboard </li>
          </ul>

          <p style={{marginBottom: 200}}>Scroll down for answer</p>

          <ul>
            <li>exactly how are both the dog and the person going to fit on that skateboard? &mdash; <b>not a caption, also not specific</b></li>
            <li>the dark haired dog is trying to ride on the skateboard. &mdash; <b>would better fit an image where the dog is actually on the skateboard. Doesn't describe the person: not specific.</b></li>
            <li>a person in shorts and a black dog both have one foot on a skateboard. &mdash; <b>Most likely to get bonus, because it describes this image correctly (accurate), and probably fits few other images (specific).</b></li>
            <li>a guy with a dog trying to climb on a skateboard &mdash; <b>unclear: is the guy holding the dog? inaccurate.</b></li>
          </ul>

          <NextBtn />
        </div>
      )
    },
    ...tutorials,
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
