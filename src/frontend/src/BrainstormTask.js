/**
 * @format
 * @flow
 */

import * as React from "react";
import { observer, inject } from "mobx-react";

import { createState } from "./MasterState";
import { TrialState } from "./BrainstormTrialState";
import * as Views from "./CueViews";
import { NextBtn } from "./BaseViews";
import { Survey } from "./SurveyViews";
import * as SurveyData from "./SurveyData";
import { ControlledInput, ControlledStarRating } from "./ControlledInputs";

import { finalDataLogger, iobs } from "./misc";
import { WriterView, SpyView } from "./DesktopPhraseView";

function surveyView(props) {
  return () => React.createElement(Survey, props);
}

const namedConditions = {
  norecs: { recType: null },
  randomPhrases: { recType: "randomPhrases" },
  randomSentences: { recType: "randomSentences" },
  ambientPhrases: { recType: "phraseCue", onRequest: false },
  requestPhrases: { recType: "phraseCue", onRequest: true },
};
let baseConditions = ["norecs", "randomSentences"];

const demographicsSurvey = [
  SurveyData.age,
  SurveyData.gender,
  SurveyData.english_proficiency,
  SurveyData.techDiff,
];

const finalSurveyQuestions = [
  {
    type: "options",
    responseType: "options",
    text: (
      <span>
        Is there any reason that we shouldn't use your data? If so, please
        explain in the next question.{" "}
        <b>There's no penalty for answering "don't use" here.</b>
      </span>
    ),
    options: ["Use my data", "Don't use my data"],
    name: "shouldExclude",
  },
  SurveyData.otherFinal,
];

const closingSurvey = () => ({
  screen: "PostExpSurvey",
  view: surveyView({
    title: "Closing Survey",
    basename: "postExp",
    questions: [
      SurveyData.verbalized_during,
      // SurveyData.numericResponse({
      //   name: "howManyReviewsWritten",
      //   text: `About how many online reviews (of ${reviewType} or otherwise) have you written in the past 3 months, excluding this one?`,
      // }),

      // Not going to use demographic survey for the pilot, no need for that data.
      // ...demographicsSurvey,
      ...finalSurveyQuestions,
    ],
  }),
});

const WelcomeScreen = { screen: "Welcome", view: Views.Welcome };
const DoneScreen = { screen: "Done", view: Views.Done };

const TASKS = {
  restaurant: {
    prompt: (
      <div>
        <p>
          Your friend J wants to write a review of a nice Italian restaurant
          they went to last night. J doesn't have much experience writing
          reviews, so they ask you for help coming up with ideas about what to
          write about.
        </p>

        <p>
          Give J as many different ideas about what they might include in their
          review as you can think of. J already knows to mention the food and
          the service. Aim for quantity over quality, but try to make sure each
          idea is different from your previous ones.
        </p>
      </div>
    ),

    initialIdeas: ["food", "service"],

    getScreens(conditionName: string, isDemo): Screen[] {
      return baseGetScreens(
        conditionName,
        isDemo,
        this.prompt,
        this.initialIdeas
      );
    },
  },
};

// Hacky: this needs to be an observer because userIdeas is an observable...
const IdeaList = observer(({ initialIdeas, userIdeas, addIdea }) => {
  let newIdeaEntry = React.createRef();
  function _addIdea(evt) {
    addIdea(newIdeaEntry.current.value);
    newIdeaEntry.current.value = "";
  }
  return (
    <div>
      <ul>
        {initialIdeas.map(idea => (
          <li key={idea}>{idea}</li>
        ))}
        {userIdeas.map((idea, idx) => (
          <li key={idx}>{idea}</li>
        ))}
        <li>
          <input type="text" ref={newIdeaEntry} />
          <button onClick={_addIdea}>Add</button>
        </li>
      </ul>
    </div>
  );
});

const SmartIdeaList = iobs(({ state, dispatch, initialIdeas }) => {
  function addIdea(idea) {
    dispatch({ type: "addIdea", idea });
  }
  return (
    <IdeaList
      initialIdeas={initialIdeas}
      userIdeas={state.experimentState.ideas}
      addIdea={addIdea}
    />
  );
});

function baseGetScreens(conditionName: string, isDemo, header, initialIdeas) {
  let flags = { domain: "restaurant" };
  let trial = {
    preEvent: setupTrialEvent(`final-0`, conditionName, flags),
    screen: "ExperimentScreen",
    view: () => (
      <div>
        {header}
        <SmartIdeaList initialIdeas={initialIdeas} />
        <NextBtn />
      </div>
    ),
  };

  if (isDemo) return [trial];
  return [WelcomeScreen, trial, closingSurvey(), DoneScreen];
}
const InspireMe = iobs(({ state, dispatch }) => {
  let { experimentState } = state;
  let { flags } = experimentState;
  let { onRequest } = flags;

  if (!onRequest) return false;

  return (
    <button onClick={evt => dispatch({ type: "toggleInspiration" })}>
      Inspire Me!
    </button>
  );
});

function setupTrialEvent(name: string, condition: string, flags: ?Object) {
  if (!(condition in namedConditions)) {
    throw new Error(`Invalid condition name: ${condition}`);
  }
  return {
    type: "setupTrial",
    name,
    flags: {
      condition,
      ...namedConditions[condition],
      ...flags,
    },
  };
}

export function createTaskState(loginEvent) {
  let clientId = loginEvent.participant_id;

  let prompt,
    conditions,
    isDemo = false;
  if (clientId.slice(0, 4) === "demo") {
    // Demo URLs are formatted: `demo(config)-(condition)-(prompt)-p`
    let match = clientId.match(/^demo(\w+)-(\w+)-(\w+)$/);
    console.assert(match);
    conditions = [match[2]];
    prompt = match[3];
    isDemo = true;
  } else {
    // Between-subjects for prompt (passed as config option) and condition (passed as counterbalanced assignment).
    let condition = baseConditions[loginEvent.assignment];
    conditions = [condition]; // For now, just a single task.
    prompt = loginEvent.prompt;
  }

  // Get task setup.
  let task = TASKS[prompt];
  if (!task) console.assert(`Unknown prompt ${prompt}`);
  let screens = task.getScreens(conditions[0], isDemo);

  let state = createState({
    clientId,
    screens,
    createExperimentState: flags => new TrialState(flags),
    timeEstimate: "5 minutes", // TODO: pull from Task.
  });
  finalDataLogger(state);

  return state;
}

export function screenToView(screenDesc: Screen) {
  console.assert(screenDesc.view);
  return React.createElement(screenDesc.view);
}
