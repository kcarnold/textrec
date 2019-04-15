/**
 * @format
 * @flow
 */

import * as React from "react";
import { observer } from "mobx-react";

import { createState } from "./MasterState";
import { TrialState } from "./BrainstormTrialState";
import * as Views from "./CueViews";
import { NextBtn } from "./BaseViews";
import { Survey } from "./SurveyViews";
import * as SurveyData from "./SurveyData";
import { ControlledInput, ControlledStarRating } from "./ControlledInputs";
import Timer from "./Timer";

import { finalDataLogger, iobs } from "./misc";

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

let baseConditions = ["norecs"];

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
      // SurveyData.verbalized_during,
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
          reviews, so they asked you for ideas for topics to include in their
          review.
        </p>

        <p>
          Take <b>4 minutes</b> to give J{" "}
          <b>lots of ideas about what they might include in their review</b>.
          Quantity matters more than quality.
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
  function _addIdea() {
    addIdea(newIdeaEntry.current.value);
    newIdeaEntry.current.value = "";
  }

  function onKey(evt) {
    if (evt.key === "Enter") {
      _addIdea();
    }
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
          <input type="text" ref={newIdeaEntry} onKeyPress={onKey} />
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

const Inspiration = iobs(({ state }) => (
  <div>
    {state.experimentState.suggestions.map((s, idx) => (
      <div key={idx}>{s.text}</div>
    ))}
  </div>
));

const TimerWithAdvance = iobs(({ dispatch }) => (
  <Timer timedOut={() => dispatch({ type: "next" })} />
));

function baseGetScreens(conditionName: string, isDemo, header, initialIdeas) {
  let flags = { domain: "restaurant" };
  let trial = {
    preEvent: setupTrialEvent(`final-0`, conditionName, flags),
    screen: "ExperimentScreen",
    timer: 4 * 60,
    view: () => (
      <div>
        {header}
        Time remaining: <TimerWithAdvance />
        <SmartIdeaList initialIdeas={initialIdeas} />
        <Inspiration />
      </div>
    ),
  };

  if (isDemo) return [trial];

  const instructions = {
    screen: "Instructions",
    view: () => (
      <div>
        {header}
        <p>
          Once you click "Start Writing Ideas", you can type your ideas in the
          text box that appears below. To add an idea, click "Add" or press
          Enter.
        </p>
        <NextBtn>Start Writing Ideas</NextBtn>
      </div>
    ),
  };
  return [WelcomeScreen, instructions, trial, closingSurvey(), DoneScreen];
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
