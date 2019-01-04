/**
 * @format
 * @flow
 */
import "core-js/fn/array/from";

import * as React from "react";
import { observer, inject } from "mobx-react";

import flatMap from "lodash/flatMap";
import range from "lodash/range";
import * as IOTaskState from "./IOTaskState";
import * as Views from "./IOViews";
import { NextBtn } from "./BaseViews";
import { Survey, likert } from "./SurveyViews";
import * as SurveyData from "./SurveyData";
import traitData from "./TraitData_NfCEDTO";
import { getDemoConditionName, gatingSuggestionFilter } from "./misc";

import * as shuffle from "./shuffle";

import type { Screen } from "./IOTaskState";

const iobs = fn => inject("state", "dispatch")(observer(fn));

const TRIALS_PER_CONDITION = 4;
const MIN_REC_THRESHOLD = 1;

function surveyView(props) {
  return () => React.createElement(Survey, props);
}

const namedConditions = {
  norecs: {},
  phrases: {},
  questions: {},
};
let baseConditions = ["norecs", "phrases", "questions"];

type Prompt = {
  name: string,
  text: string,
};

const basePrompts = [
  {
    name: "restaurant",
    text: "Write a review of a restaurant you visited recently.",
  },

  {
    name: "movie",
    text: "Write a review of a movie or TV show you watched recently.",
  },

  {
    name: "home",
    text:
      "Write a description of a home or apartment that you're very familiar with.", // TODO: for someone to visit...?
  },
];

const introSurvey = () => ({
  title: "Opening Survey",
  basename: "intro",
  questions: [
    {
      text:
        "There will be several short surveys like this as breaks from the writing task.",
    },
  ],
});

const closingSurvey = () => ({
  title: "Closing Survey",
  basename: "postExp",
  questions: [
    SurveyData.verbalized_during,
    SurveyData.age,
    SurveyData.gender,
    SurveyData.english_proficiency,
    SurveyData.techDiff,
    {
      type: "options",
      text: (
        <span>
          Is there any reason that we shouldn't use your data?{" "}
          <b>There's no penalty for answering Yes here.</b> If yes, please
          explain in the next question.
        </span>
      ),
      options: ["Yes", "No"],
      name: "shouldExclude",
    },
    SurveyData.otherFinal,
  ],
});

/** Experiment Blocks **/

function experimentBlock(
  block: number,
  conditionName: string,
  prompt: Prompt
): Array<Screen> {
  return [
    {
      screen: "Instructions",
      view: () => (
        <div>
          Now we'll be using
          <h1>Keyboard Design {block + 1}</h1>
          <NextBtn />
        </div>
      ),
    },
    trialScreen({
      name: `final-${block}`,
      condition: conditionName,
      prompt,
    }),
    {
      screen: "PostTaskSurvey",
      view: surveyView({
        title: `Survey for Keyboard Design ${block + 1}`,
        basename: `postTask-${block}`,
        questions: [SurveyData.techDiff, SurveyData.otherMid],
      }),
    },
  ];
}

function getDemoScreens(condition: string) {
  return basePrompts.map((prompt, idx) =>
    trialScreen({
      name: `final-${idx}`,
      condition,
      prompt,
    })
  );
}

const StudyDesc = () => (
  <div>
    <h1>Study Preview</h1>
    <p>TODO</p>
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
    <p>
      At the end, you will be comparing your experiences between the different
      keyboards. So <b>please try to remember which is which</b>!
    </p>
    Ready to get started? <NextBtn />
  </div>
);

function getScreens(conditions: string[], prompts: Prompt[]): Screen[] {
  let result = [
    { screen: "Welcome" },
    {
      screen: "IntroSurvey",
      view: surveyView(introSurvey()),
    },
    { screen: "StudyDesc", view: StudyDesc },
    ...flatMap(prompts, (prompt, idx) =>
      experimentBlock(idx, conditions[idx], prompt)
    ),

    {
      screen: "PostExpSurvey",
      view: surveyView(closingSurvey()),
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
  prompt: PRompt,
}) {
  let { name, condition, flags, prompt } = props;
  if (!(condition in namedConditions)) {
    throw new Error(`Invalid condition name: ${condition}`);
  }
  return {
    preEvent: {
      type: "setupExperiment",
      name,
      flags: {
        condition,
        ...namedConditions[condition],
        prompt,
        ...flags,
      },
    },
    screen: "ExperimentScreen",
    view: experimentView({}),
  };
}

let conditionOrders = shuffle.permutator(baseConditions);

export function createTaskState(loginEvent) {
  let clientId = loginEvent.participant_id;

  let screens, prompts;
  let demoConditionName = getDemoConditionName(clientId);
  if (demoConditionName != null) {
    screens = getDemoScreens(demoConditionName);
  } else {
    if ("n_conditions" in loginEvent) {
      console.assert(loginEvent.n_conditions === conditionOrders.length);
    }
    let conditions = conditionOrders[loginEvent.assignment];
    prompts = basePrompts.slice();
    screens = getScreens(conditions, prompts);
  }

  let state = new IOTaskState.MasterStateStore({
    clientId,
    screens,
    handleEvent,
    createExperimentState: flags => new ExperimentStateStore(flags),
    timeEstimate: "20-25 minutes",
  });

  function handleEvent(event: Event): Event[] {
    if (event.type === "next") {
      if (state.screenNum === screens.length - 2) {
        let finalData = {
          screenTimes: state.screenTimes.map(screen => ({
            ...screen,
            name: screens[screen.num].screen,
          })),
          controlledInputs: [...state.controlledInputs.toJS()],
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
    return [];
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
