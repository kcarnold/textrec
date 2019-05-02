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
import { Survey, likert } from "./SurveyViews";
import * as SurveyData from "./SurveyData";
import { ControlledInput, ControlledStarRating } from "./ControlledInputs";
import Timer from "./Timer";

import { finalDataLogger, iobs } from "./misc";

function surveyView(props) {
  return () => React.createElement(Survey, props);
}

const namedConditions = {
  norecs: { recType: null },
  randomSents: { recType: "randomSents" },
  cueSents: { recType: "cueSents" },
};

let baseConditions = ["norecs"];

const demographicsSurvey = [
  SurveyData.age,
  SurveyData.gender,
  SurveyData.english_proficiency,
  SurveyData.techDiff,
];

const selfEfficacyQuestions = writingType => [
  SurveyData.selfEfficacy(`recognizing good ${writingType}`),
  SurveyData.selfEfficacy(`writing good ${writingType}`),
];

const experienceAndSelfEfficacyQuestions = writingType => [
  SurveyData.numericResponse({
    name: "howManyReviewsWritten",
    text: `About how many ${writingType} have you written in the past 3 months?`,
  }),
  ...selfEfficacyQuestions(writingType),
];

const closingSurvey = writingType => ({
  screen: "PostExpSurvey",
  view: surveyView({
    title: "Closing Survey",
    basename: "postExp",
    questions: [
      {
        type: "text",
        text:
          "We were actually only interested in the pre-writing. So you don't actually have to do the writing task! Just answer the following questions and we'll be done.",
      },
      // likert("fluency", "How fluent did you feel ")
      ...selfEfficacyQuestions(writingType),
      // SurveyData.verbalized_during,

      // Not going to use demographic survey for the pilot, no need for that data.
      // ...demographicsSurvey,

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
    ],
  }),
});

const WelcomeScreen = { screen: "Welcome", view: Views.Welcome };
const DoneScreen = { screen: "Done", view: Views.Done };
const baseTrial = (header, conditionName, flags, minutes) => ({
  preEvent: setupTrialEvent(`final-0`, conditionName, flags),
  screen: "ExperimentScreen",
  timer: minutes * 60,
  view: () => (
    <div style={{ maxWidth: "1000px", margin: "0 auto" }}>
      {header}
      <div style={{ display: "flex", flexFlow: "col nowrap" }}>
        <SmartIdeaList initialIdeas={[]} />
        <InspirationBox />
      </div>
      <TimedNextBtn />
    </div>
  ),
});
const precommitScreen = lead => ({
  screen: "Precommit",
  view: () => (
    <div>
      {lead}
      <div
        style={{
          borderBottom: "1px solid black",
          padding: "12px",
          lineHeight: 1.5,
        }}
      >
        Name: <ControlledInput name={"thingName"} />
        <br />
        About how long ago, in days?{" "}
        <ControlledInput name={"daysAgo"} type="number" min="0" />
        <br />
        How would you rate it? <ControlledStarRating name={"star"} />
      </div>
      <NextBtn />
    </div>
  ),
});

const ReviewHeader = iobs(({ controlledInputName, state, minutes }) => (
  <div>
    <h1>
      Pre-writing for your review of{" "}
      <i>{state.controlledInputs.get(controlledInputName)}</i>
    </h1>
    <p>Before we write a review, we're going to do a pre-writing exercise.</p>
    <blockquote>
      <b>
        Imagine someone is interviewing you about your experience. What relevant
        questions could they ask you? Think of as many as you can in {minutes}{" "}
        minutes.
      </b>
    </blockquote>
    <p>You can click Add or press Enter to add a question.</p>
  </div>
));

const TASKS = {
  restaurant: {
    getScreens(conditionName: string, isDemo): Screen[] {
      const minutes = 4;
      const writingType = "restaurant reviews";
      const header = (
        <ReviewHeader controlledInputName="thingName" minutes={minutes} />
      );
      let flags = { domain: "restaurant" };
      let trial = baseTrial(header, conditionName, flags, minutes);

      if (isDemo) return [trial];

      const introSurvey = {
        screen: "IntroSurvey",
        view: surveyView({
          title: "Opening Survey",
          basename: "intro",
          questions: [...experienceAndSelfEfficacyQuestions(writingType)],
        }),
      };

      const instructions = {
        screen: "Instructions",
        view: () => (
          <div>
            {header}
            <p>
              Once you click "Start", you can type your questions in the text
              box that appears below.
            </p>
            <NextBtn>Start</NextBtn>
          </div>
        ),
      };

      return [
        WelcomeScreen,
        introSurvey,
        precommitScreen(
          <span>
            Think of a restaurant (or bar, cafe, diner, etc.) that you've been
            to recently that you <b>haven't written about before</b>.
          </span>
        ),
        instructions,
        trial,
        closingSurvey(writingType),
        DoneScreen,
      ];
    },
  },

  movie: {
    getScreens(conditionName: string, isDemo): Screen[] {
      const minutes = 4;
      const writingType = "movie reviews";
      const header = (
        <ReviewHeader controlledInputName="thingName" minutes={minutes} />
      );
      let flags = { domain: "movie" };
      let trial = baseTrial(header, conditionName, flags, minutes);

      if (isDemo) return [trial];

      const introSurvey = {
        screen: "IntroSurvey",
        view: surveyView({
          title: "Opening Survey",
          basename: "intro",
          questions: [...experienceAndSelfEfficacyQuestions(writingType)],
        }),
      };

      const instructions = {
        screen: "Instructions",
        view: () => (
          <div>
            {header}
            <p>
              Once you click "Start", you can type your questions in the text
              box that appears below. You can click Add or press Enter.
            </p>
            <NextBtn>Start</NextBtn>
          </div>
        ),
      };

      return [
        WelcomeScreen,
        introSurvey,
        precommitScreen(
          <span>
            Think of a movie or TV show that you've seen recently that you{" "}
            <b>haven't written about before</b>.
          </span>
        ),
        instructions,
        trial,
        closingSurvey(writingType),
        DoneScreen,
      ];
    },
  },

  bio: {
    getScreens(conditionName: string, isDemo): Screen[] {
      const minutes = 4;
      const writingType = "bios";
      const header = (
        <div>
          <h1>Pre-writing for your bio</h1>
          <p>
            Before we write the bio, we're going to do a little pre-writing
            exercise.
          </p>
          <blockquote>
            <b>
              Imagine someone is interviewing you about yourself. What relevant
              questions could they ask you? Think of as many as you can in{" "}
              {minutes} minutes.
            </b>
          </blockquote>
        </div>
      );
      let flags = { domain: "bio" };
      let trial = baseTrial(header, conditionName, flags, minutes);

      if (isDemo) return [trial];

      const introSurvey = {
        screen: "IntroSurvey",
        view: surveyView({
          title: "Opening Survey",
          basename: "intro",
          questions: [...experienceAndSelfEfficacyQuestions(writingType)],
        }),
      };

      const instructions = {
        screen: "Instructions",
        view: () => (
          <div>
            {header}
            <p>
              Once you click "Start", you can type your questions in the text
              box that appears below. You can click Add or press Enter.
            </p>
            <NextBtn>Start</NextBtn>
          </div>
        ),
      };

      return [
        WelcomeScreen,
        introSurvey,
        instructions,
        trial,
        closingSurvey(writingType),
        DoneScreen,
      ];
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
    <div style={{ flex: "1 0 auto" }}>
      <ul>
        {initialIdeas.map(idea => (
          <li key={idea}>{idea}</li>
        ))}
        {userIdeas.map((idea, idx) => (
          <li key={idx}>{idea}</li>
        ))}
        <li>
          <input
            style={{ width: "250px" }}
            type="text"
            ref={newIdeaEntry}
            onKeyPress={onKey}
          />{" "}
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

const InspirationBox = iobs(({ state, dispatch }) =>
  state.experimentState.suggestions ? (
    <div style={{ padding: "10px", border: "1px solid black", width: "350px" }}>
      <button onClick={e => dispatch({ type: "inspireMe" })}>
        Inspire Me!
      </button>
      <br />
      {state.experimentState.suggestions.length > 0 && (
        <div>
          <b>Ideas</b> from other people's writing
          <ul>
            {state.experimentState.suggestions.map((s, idx) => (
              <li key={idx} style={{ marginBottom: "5px" }}>
                {s.text}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  ) : null
);

const TimedNextBtn = iobs(({ state, dispatch }) =>
  state.experimentState.allowSubmit ? (
    <NextBtn>Submit</NextBtn>
  ) : (
    <p>
      Time remaining:{" "}
      <Timer timedOut={() => dispatch({ type: "allowSubmit" })} />
    </p>
  )
);

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
