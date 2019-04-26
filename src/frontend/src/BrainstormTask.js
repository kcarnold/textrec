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

const ReviewHeader = iobs(({ controlledInputName, state }) => (
  <div>
    <h1>
      Pre-writing for your review of{" "}
      <i>{state.controlledInputs.get(controlledInputName)}</i>
    </h1>
    <p>
      Before we write a review, we're going to do a little pre-writing exercise.
    </p>
    <blockquote>
      <b>
        Imagine someone is interviewing you about your visit to this restaurant.
        What relevant questions could they ask you? Think of as many as you can
        in 4 minutes.
      </b>
    </blockquote>
  </div>
));

const TASKS = {
  restaurant: {
    initialIdeas: [],

    getScreens(conditionName: string, isDemo): Screen[] {
      return baseGetScreens(
        conditionName,
        isDemo,
        <ReviewHeader controlledInputName="restaurantName" />,
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

const InspirationBox = iobs(({ state }) =>
  state.experimentState.suggestions ? (
    <div style={{ padding: "10px", border: "1px solid black" }}>
      <p>
        <b>Ideas</b> from other people's writing
      </p>
      <Inspiration />
    </div>
  ) : null
);

const TimerWithAdvance = iobs(({ dispatch }) => (
  <Timer timedOut={() => dispatch({ type: "next" })} />
));

const RestaurantPrompt = () => (
  <div className="Restaurant">
    Name of the place: <ControlledInput name={"restaurantName"} />
    <br />
    About how long ago were you there, in days?{" "}
    <ControlledInput name={"visitDaysAgo"} type="number" min="0" />
    <br />
    How would you rate that visit? <ControlledStarRating name={"star"} />
  </div>
);

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
        <div style={{ display: "flex", flexFlow: "col nowrap" }}>
          <SmartIdeaList initialIdeas={initialIdeas} />
          <InspirationBox />
        </div>
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
          Once you click "Start", you can type your questions in the text box
          that appears below. You can click Add or press Enter.
        </p>
        <NextBtn>Start</NextBtn>
      </div>
    ),
  };

  const precommitScreen = {
    screen: "Precommit",
    view: () => (
      <div>
        Think of a restaurant (or bar, cafe, diner, etc.) that you've been to
        recently that you <b>haven't written about before</b>.
        <RestaurantPrompt />
        <NextBtn />
      </div>
    ),
  };

  return [
    WelcomeScreen,
    precommitScreen,
    instructions,
    trial,
    closingSurvey(),
    DoneScreen,
  ];
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

export function createTaskState(loginEvent: {
  participant_id: string,
  assignment: number,
  prompt: string,
}) {
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
