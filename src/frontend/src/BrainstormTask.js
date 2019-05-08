/**
 * @format
 * @flow
 */

import * as React from "react";
import { observer } from "mobx-react";

import { createState } from "./MasterState";
import { TrialState } from "./BrainstormTrialState";
import * as Views from "./CueViews";
import { Editable } from "./Editable";
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

let baseConditions = ["norecs", "randomSents", "cueSents"];

const demographicsSurvey = [
  SurveyData.age,
  SurveyData.gender,
  SurveyData.english_proficiency,
  SurveyData.techDiff,
];

const selfEfficacyQuestions = writingType => [
  SurveyData.selfEfficacy(
    "recognizing",
    <span>
      <b>recognizing</b> good {writingType.plural}
    </span>
  ),
  SurveyData.selfEfficacy(
    "writing",
    <span>
      <b>writing</b> good {writingType.plural}
    </span>
  ),
];

const experienceAndSelfEfficacyQuestions = writingType => [
  SurveyData.numericResponse({
    name: "howManyReviewsWritten",
    text: `About how many ${
      writingType.plural
    } have you written in the past 3 months?`,
  }),
  ...selfEfficacyQuestions(writingType),
];

const introSurvey = writingType => ({
  screen: "IntroSurvey",
  view: surveyView({
    title: "Opening Survey",
    basename: "intro",
    questions: [
      {
        type: "text",
        text: (
          <p>
            You'll be writing {writingType.singular}. We'll walk you through the
            process; <b>do all your work within this window</b>. First, though a
            few background questions:
          </p>
        ),
      },
      ...experienceAndSelfEfficacyQuestions(writingType),
    ],
  }),
});

const instructions = header => ({
  screen: "Instructions",
  view: () => (
    <div className="Survey">
      {header}
      <p>Click "Start" to begin.</p>
      <NextBtn>Start</NextBtn>
    </div>
  ),
});

const closingSurvey = writingType => ({
  screen: "PostExpSurvey",
  view: surveyView({
    title: "Closing Survey",
    basename: "postExp",
    questions: [
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

const baseTrialPrewrite = (header, conditionName, flags, minutes) => ({
  preEvent: setupTrialEvent(`final-0`, conditionName, flags),
  screen: "ExperimentScreen",
  timer: minutes * 60,
  view: () => (
    <div style={{ maxWidth: "1000px", margin: "0 auto" }}>
      {header}
      <div style={{ display: "flex", flexFlow: "col nowrap" }}>
        <SmartIdeaList />
        <InspirationBox />
      </div>
      <TimedNextBtn />
    </div>
  ),
});

const WritingView = iobs(({ state, dispatch }) => (
  <Editable
    text={state.experimentState.curText}
    onChange={newVals => {
      dispatch({ type: "setText", text: newVals.text });
    }}
  />
));

const stage2 = (header, minutes) => ({
  screen: "ExperimentScreen2",
  timer: minutes * 60,
  view: () => (
    <div style={{ maxWidth: "1000px", margin: "0 auto" }}>
      {header}
      <WritingView />
      <TimedNextBtn />
    </div>
  ),
});

const precommitScreen = lead => ({
  screen: "Precommit",
  view: () => (
    <div className="Survey">
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

const ReviewHeaderPrewrite = iobs(({ controlledInputName, state, minutes }) => (
  <div>
    <h1>
      Pre-writing for your review of{" "}
      <i>{state.controlledInputs.get(controlledInputName)}</i>
    </h1>
    <p>Before you write a review, let's do a little brainstorming:</p>
    <blockquote>
      Imagine someone is interviewing you about your experience.{" "}
      <b>What questions could they ask you?</b>
    </blockquote>
    <ul>
      <li>Try to list as many as you can.</li>
      <li>Go for quantity, not quality.</li>
      <li>Think of as many as you can in {minutes} minutes.</li>
    </ul>
    <p>You can click Add or press Enter to add a question.</p>
  </div>
));

const ReviewHeaderFinal = iobs(({ controlledInputName, state, minutes }) => (
  <div>
    <h1>
      Your review of <i>{state.controlledInputs.get(controlledInputName)}</i>
    </h1>
    <p>Now, write an informative review.</p>
    <p>Here are the questions you listed. You are not obligated to use them.</p>
    <SmartIdeaList fixed />
    <p>
      You'll have {minutes} minutes; when the time is up, finish your sentence
      and click the Next button that will appear.
    </p>
  </div>
));

function getScreens(task, conditionName, isDemo) {
  const {
    prewriteHeader,
    finalHeader,
    flags,
    prewriteMinutes,
    finalMinutes,
    writingType,
    precommitScreen,
  } = task;
  let trial = baseTrialPrewrite(
    prewriteHeader,
    conditionName,
    flags,
    prewriteMinutes
  );

  if (isDemo) return [trial];

  return [
    WelcomeScreen,
    introSurvey(writingType),
    precommitScreen,
    instructions(prewriteHeader),
    trial,
    instructions(finalHeader),
    stage2(finalHeader, finalMinutes),
    closingSurvey(writingType),
    DoneScreen,
  ];
}

const TASKS = {
  restaurant: {
    precommitScreen: precommitScreen(
      <span>
        Think of a restaurant (or bar, cafe, diner, etc.) that you've been to
        recently that you <b>haven't written about before</b>.
      </span>
    ),
    prewriteMinutes: 4,
    finalMinutes: 4,

    flags: { domain: "restaurant" },

    writingType: {
      singular: "a restaurant review",
      plural: "restaurant reviews",
    },

    // FIXME: this reuses the value of "minutes".
    prewriteHeader: (
      <ReviewHeaderPrewrite controlledInputName="thingName" minutes={4} />
    ),
    finalHeader: (
      <ReviewHeaderFinal controlledInputName="thingName" minutes={4} />
    ),
  },

  movie: {
    prewriteMinutes: 4,
    finalMinutes: 4,
    precommitScreen: precommitScreen(
      <span>
        Think of a movie or TV show that you've seen recently that you{" "}
        <b>haven't written about before</b>.
      </span>
    ),
    flags: { domain: "movie" },

    writingType: {
      singular: "a movie review",
      plural: "movie reviews",
    },

    prewriteHeader: (
      <ReviewHeaderPrewrite controlledInputName="thingName" minutes={4} />
    ),
    finalHeader: (
      <ReviewHeaderFinal controlledInputName="thingName" minutes={4} />
    ),
  },

  bio: {
    prewriteMinutes: 4,
    finalMinutes: 4,
    precommitScreen: null,
    writingType: {
      singular: "a bio",
      plural: "bios",
    },
    prewriteHeader: (
      <div>
        <h1>Pre-writing for your bio</h1>
        <p>
          Before we write the bio, we're going to do a little pre-writing
          exercise.
        </p>
        <blockquote>
          Imagine someone is interviewing you about yourself.{" "}
          <b>What relevant questions could they ask you?</b> Think of as many as
          you can in {4} minutes.
        </blockquote>
      </div>
    ),
    flags: { domain: "bio" },
  },
};

// Hacky: this needs to be an observer because userIdeas is an observable...
const IdeaList = observer(({ userIdeas, addIdea }) => {
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
        {userIdeas.map((idea, idx) => (
          <li key={idx}>{idea}</li>
        ))}
        {addIdea && (
          <li>
            <input
              style={{ width: "250px" }}
              type="text"
              ref={newIdeaEntry}
              onKeyPress={onKey}
            />{" "}
            <button onClick={_addIdea}>Add</button>
          </li>
        )}
      </ul>
    </div>
  );
});

const SmartIdeaList = iobs(({ state, dispatch, fixed }) => {
  function addIdea(idea) {
    dispatch({ type: "addIdea", idea });
  }
  return (
    <IdeaList
      userIdeas={state.experimentState.ideas}
      addIdea={fixed ? null : addIdea}
    />
  );
});

const highlightedSpan = (text, highlight) => {
  if (!highlight) return <span>{text}</span>;
  let [a, b] = highlight;
  return (
    <span>
      {text.slice(0, a)}
      <b>{text.slice(a, b)}</b>
      {text.slice(b)}
    </span>
  );
};

const InspirationBox = iobs(({ state, dispatch }) =>
  state.experimentState.flags.recType !== null ? (
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
                {false ? highlightedSpan(s.text, s.highlight_span) : s.text}
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
    // Between-subjects for prompt and condition (passed as counterbalanced assignment).
    let condition = baseConditions[loginEvent.assignment];
    conditions = [condition]; // For now, just a single task.
    prompt = loginEvent.prompt;
  }

  // Get task setup.
  let task = TASKS[prompt];
  if (!task) console.assert(`Unknown prompt ${prompt}`);
  let screens = getScreens(task, conditions[0], isDemo);

  let state = createState({
    clientId,
    screens,
    createExperimentState: flags => new TrialState(flags),
    timeEstimate: "10 minutes", // TODO: pull from Task.
  });
  finalDataLogger(state);

  return state;
}

export function screenToView(screenDesc: Screen) {
  console.assert(screenDesc.view);
  return React.createElement(screenDesc.view);
}
