// @flow
import React from "react";
import { observer, inject } from "mobx-react";

import flatMap from "lodash/flatMap";
import * as IOTaskState from "./IOTaskState";
import * as Views from "./IOViews";
import { NextBtn } from "./BaseViews";
import { Survey, likert } from "./SurveyViews";
import {
  personalityBlock,
  tlxQuestions,
  miscQuestions,
  closingSurveyQuestions,
} from "./SurveyData";

import { seededShuffle } from "./shuffle";

import type { Screen } from "./IOTaskState";

const iobs = fn => inject("state", "dispatch")(observer(fn));

const TRIALS_PER_CONDITION = 2;

function surveyView(props) {
  return () => React.createElement(Survey, props);
}

type Stimulus = {
  type: "img",
  content: number,
};

let baseStimuli: Stimulus[] = [
  { type: "img", content: 150367 },
  { type: "img", content: 524881 },
  { type: "img", content: 127298 },
  { type: "img", content: 232689 },
  { type: "img", content: 283426 },
  { type: "img", content: 275075 },
  // { type: "img", content: "000000107610" },
  // { type: "img", content: "000000093272" },
  // { type: "img", content: "000000218224" },
  // { type: "img", content: "000000138629" },
  // { type: "img", content: "000000306670" },
  // { type: "img", content: "000000165203" },
];

let tutorialStimuli = [
  {
    stimulus: { type: "img", content: 133707 },
    transcribe:
      "a black cat naps on a sunny unpainted wooden bench in front of a red wall",
  },
  {
    stimulus: { type: "img", content: 533452 },
    transcribe:
      "a man with black hair and glasses placing a large turkey into an upper oven",
  },
  {
    stimulus: { type: "img", content: 314515 },
    transcribe:
      "a black and red pontiac vehicle with a group of bikes on top of it and people standing near by with umbrellas.",
  },
];

const namedConditions = {
  norecs: {
    requestFlags: {},
    modelSeesStimulus: false,
    hideRecs: true,
  },
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
  },
};

const urlForImage = content => {
  let padded = `${content}`;
  while (padded.length < 12) padded = "0" + padded;
  console.assert(padded.length === 12);
  return `http://images.cocodataset.org/train2017/${padded}.jpg`;
  // return `http://visualqa.org/data/abstract_v002/scene_img/img/${content}.png`;
};

const StimulusView = ({ stimulus }) => {
  // if (stimulus.type === "doc") {
  //   return (
  //     <div
  //       style={{
  //         whiteSpace: "pre-line",
  //         background: "white",
  //         margin: "5px 2px"
  //       }}
  //     >
  //       {stimulus.content}
  //     </div>
  //   );
  // } else if (stimulus.type === "img") {
  return (
    <div>
      <img
        src={urlForImage(stimulus.content)}
        style={{ width: "100%" }}
        alt="(image to caption should display here)"
      />
    </div>
  );
  // }
};

const CapInstructions = iobs(({ state }) => (
  <div>
    Write the most specific and accurate description you can for the image
    below. After you're done, tap here:{" "}
    <NextBtn disabled={state.experimentState.wordCount < 10} />
    <StimulusView stimulus={state.experimentState.stimulus} />
  </div>
));

function experimentBlock(
  block: number,
  conditionName: string,
  stimuli: Stimulus[]
): Array<Screen> {
  let agreeLikert = (name, prompt) =>
    likert(name, prompt, 7, ["Strongly disagree", "Strongly agree"]);
  let designQuestions = [
    agreeLikert(
      "sys-specific",
      "This keyboard design helped me write captions that were very specific"
    ),
    agreeLikert(
      "sys-accurate",
      "This keyboard design helped me write captions that were very accurate"
    ),
    agreeLikert(
      "sys-fast",
      "This keyboard design helped me write captions quickly"
    ),
  ];
  let tutorialStimulus = tutorialStimuli[block];

  return [
    {
      screen: "Instructions",
      view: () => (
        <div>
          Now we'll be using
          <h1>Keyboard Design {block + 1}</h1>
          We'll start with a practice round. <NextBtn />
        </div>
      ),
    },
    trialScreen({
      name: `practice-${block}`,
      condition: conditionName,
      transcribe: tutorialStimulus.transcribe.toLowerCase(),
      stimulus: tutorialStimulus.stimulus,
      instructions: TutorialInstructions(block),
    }),
    {
      screen: "Ready",
      view: () => (
        <div>
          About to start writing captions using
          <h1>Keyboard design {block + 1}</h1>
          Tap Next when ready: <NextBtn />
        </div>
      ),
    },
    ...stimuli.map((stimulus, idx) =>
      trialScreen({
        name: `final-${block}-${idx}`,
        condition: conditionName,
        stimulus,
        instructions: CapInstructions,
      })
    ),
    {
      screen: "PostTaskSurvey",
      view: surveyView({
        title: `Survey for Keyboard Design ${block + 1}`,
        basename: `postTask-${block}`,
        questions: [
          // likert("specific", "How specific was the caption you wrote?", 7, [
          //   "Very generic",
          //   "Very specific"
          // ]),
          ...designQuestions,
          ...tlxQuestions,
          // ...personalityBlock(block + 1),
          ...miscQuestions,
        ],
      }),
    },
  ];
}

const TutorialInstructions = block =>
  iobs(({ state }) => (
    <div>
      <h1>Practice with Keyboard Design {block + 1}</h1>

      <b>Type this caption:</b>
      <br />
      <div style={{ background: "white" }}>
        {state.experimentState.transcribe}
      </div>
      <NextBtn />
    </div>
  ));

function getDemoScreens(condition: string, stimulus: Stimulus) {
  return [
    trialScreen({
      name: `final-0`,
      condition,
      stimulus,
      instructions: CapInstructions,
    }),
  ];
}

const TaskDescription = () => (
  <div>
    <p>
      In this study we're going to be writing captions for images. The captions
      should be <b>specific</b> and <b>accurate</b>.
    </p>

    <h3>Example</h3>

    <StimulusView stimulus={{ type: "img", content: 395402 }} />

    <ul className="spaced">
      <li>
        A dog with a collar is sitting in a carpeted room. &mdash;{" "}
        <b>Not specific.</b>
      </li>
      <li>
        An alert tricolor dalmation is looking to its left. &mdash;{" "}
        <b>Not accurate.</b>
      </li>
      <li>
        An alert tricolor terrier is looking to its right. &mdash;{" "}
        <b>Good: both specific and accurate</b>
      </li>
    </ul>

    <p>
      Why? Other people will be shown your caption and they'll have to pick out
      the right image from a line-up, like this:
    </p>

    <StimulusView stimulus={{ type: "img", content: 395402 }} />
    <StimulusView stimulus={{ type: "img", content: 6710 }} />
    <StimulusView stimulus={{ type: "img", content: 250868 }} />

    <p>
      A bonus of $0.50 will be available to the most specific and accurate
      captions!
    </p>

    <h3>Quiz</h3>
    <StimulusView stimulus={{ type: "img", content: 251368 }} />

    <p>Which of the following captions is most likely to get the bonus?</p>

    <ul className="spaced">
      <li>
        exactly how are both the dog and the person going to fit on that
        skateboard?
      </li>
      <li>the dark haired dog is trying to ride on the skateboard.</li>
      <li>
        a person in shorts and a black dog both have one foot on a skateboard.
      </li>
      <li>a guy with a dog trying to climb on a skateboard </li>
    </ul>

    <p style={{ marginBottom: 500 }}>Scroll down for answer...</p>

    <ul className="spaced">
      <li>
        exactly how are both the dog and the person going to fit on that
        skateboard? &mdash; <b>not a caption, also not specific</b>
      </li>
      <li>
        the dark haired dog is trying to ride on the skateboard. &mdash;{" "}
        <b>
          would better fit an image where the dog is actually on the skateboard.
          Doesn't describe the person: not specific.
        </b>
      </li>
      <li>
        a person in shorts and a black dog both have one foot on a skateboard.
        &mdash;{" "}
        <b>
          Most likely to get bonus, because it describes this image correctly
          (accurate), and probably fits few other images (specific).
        </b>
      </li>
      <li>
        a guy with a dog trying to climb on a skateboard &mdash;{" "}
        <b>unclear: is the guy holding the dog? inaccurate.</b>
      </li>
    </ul>

    <NextBtn />
  </div>
);

const StudyDesc = () => (
  <div>
    <h1>Study Preview</h1>
    <p>
      You'll use {baseConditions.length} different keyboard designs in this
      study.
    </p>
    <p>
      For each keyboard design, there will be a practice round to get used to
      it, then you'll type {TRIALS_PER_CONDITION} captions using it, and finally
      a short survey.
    </p>
    <p>
      You will type a total of {baseConditions.length * TRIALS_PER_CONDITION}{" "}
      captions.
    </p>
    <p>Note:</p>
    <ul className="spaced">
      <li>
        All of the keyboard designs have a simplified key layout: no caps, and
        only a few extra symbols.
      </li>
      <li>
        You can't edit text you've already entered, other than by deleting and
        retyping it. Sorry.
      </li>
      <li>Autocorrect doesn't work. Please try to avoid typos.</li>
      <li>
        At the end, you will be comparing your experiencecs between the
        different keyboards. So <b>please try to remember which is which</b>!
      </li>
    </ul>
    Ready to get started? <NextBtn />
  </div>
);

// Surveys
const introSurvey = {
  title: "Opening Survey",
  basename: "intro",
  questions: [
    {
      text:
        "There will be several short surveys like this as breaks from the writing task.",
    },

    // TODO: should we break this down into prediction, correction, gesture, etc.?
    {
      text: "Do you use predictive typing on your phone?",
      responseType: "options",
      name: "use_predictive",
      options: ["Yes", "No"],
    },

    // ...personalityBlock(0)
  ],
};

function getScreens(conditions: string[], stimuli: Stimulus[]): Screen[] {
  // Group stimuli by block.
  console.assert(stimuli.length === conditions.length * TRIALS_PER_CONDITION);
  let blocks = conditions.map((condition, idx) => ({
    condition,
    stimuli: stimuli
      .slice(idx * TRIALS_PER_CONDITION)
      .slice(0, TRIALS_PER_CONDITION),
  }));

  let result = [
    { screen: "Welcome" },
    { screen: "IntroSurvey", view: surveyView(introSurvey) },
    { screen: "TaskDescription", view: TaskDescription },
    { screen: "StudyDesc", view: StudyDesc },

    ...flatMap(blocks, (block, idx) =>
      experimentBlock(idx, block.condition, block.stimuli)
    ),

    {
      screen: "PostExpSurvey",
      view: surveyView({
        title: "Closing Survey",
        basename: "postExp",
        questions: [...closingSurveyQuestions],
      }),
    },
    { screen: "Done" },
  ];
  return result;
}

function experimentView(props) {
  return () => {
    let instructions = React.createElement(props.instructions);
    return <Views.ExperimentScreen instructions={instructions} />;
  };
}

function trialScreen(props: {
  name: string,
  condition: string,
  flags: ?Object,
  instructions: React.Component,
  stimulus: Stimulus,
  transcribe: ?string,
}) {
  let { name, condition, flags, instructions, stimulus, transcribe } = props;
  return {
    preEvent: {
      type: "setupExperiment",
      name,
      flags: {
        condition,
        ...namedConditions[condition],
        stimulus,
        transcribe,
        ...flags,
      },
    },
    screen: "ExperimentScreen",
    view: experimentView({ instructions }),
  };
}

let baseConditions = ["norecs", "general", "specific"];

export function createTaskState(clientId: string) {
  clientId = clientId || "";

  let screens, stimuli;
  let demoConditionName = IOTaskState.getDemoConditionName(clientId);
  if (demoConditionName != null) {
    screens = getDemoScreens(demoConditionName, baseStimuli[0]);
  } else {
    let conditions = seededShuffle(`${clientId}-conditions`, baseConditions);
    stimuli = seededShuffle(`${clientId}-stimuli`, baseStimuli);
    screens = getScreens(conditions, stimuli);
  }

  let state = new IOTaskState.MasterStateStore({
    clientId,
    screens,
    handleEvent,
    timeEstimate: "20 minutes",
  });

  function handleEvent(event: Event): Event[] {
    if (event.type === "next") {
      if (state.screenNum === screens.length - 2) {
        let finalData = {
          screenTimes: state.screenTimes.map(screen => ({
            ...screen,
            name: screens[screen.num].screen,
          })),
          controlledInputs: state.controlledInputs.toJS(),
          texts: Array.from(
            state.experiments.entries(),
            ([expName, expState]) => ({
              name: expName,
              condition: expState.flags.condition,
              text: expState.curText,
            })
          ),
        };
        return [
          {
            type: "finalData",
            finalData,
          },
        ];
      }
    }
  }

  return state;
}

export function screenToView(screenDesc: Screen) {
  if (screenDesc.view) {
    return React.createElement(screenDesc.view);
  }
  let screenName = screenDesc.screen;
  console.assert(screenName in Views);
  return React.createElement(Views[screenName]);
}
