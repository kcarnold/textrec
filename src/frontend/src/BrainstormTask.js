/**
 * @format
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
import * as shuffle from "./shuffle";

const namedConditions = {
  norecs: { recType: null },
  randomSents: { recType: "randomSents" },
  cueSents: { recType: "cueSents" },
};

let baseConditions = ["norecs", "randomSents", "cueSents"];

const WelcomeScreen = { screen: "Welcome", view: Views.Welcome };
const DoneScreen = { screen: "Done", view: Views.Done };

function surveyView(props) {
  return () => React.createElement(Survey, props);
}

/**
 * Ideation stuff
 */

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
                {s.text}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  ) : null
);

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
    <div>
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

const WritingView = iobs(({ state, dispatch }) => (
  <Editable
    text={state.experimentState.curText}
    onChange={newVals => {
      dispatch({ type: "setText", text: newVals.text });
    }}
  />
));

const TimedNextBtn = iobs(({ state, dispatch }) =>
  state.experimentState.allowSubmit ? (
    <NextBtn>Submit</NextBtn>
  ) : (
    <p>
      Time remaining:{" "}
      <Timer timedOut={() => dispatch({ type: "allowSubmit" })} />
      <NextBtn disabled={true} />
    </p>
  )
);

function getScreens(prompts, conditionNames, isDemo) {
  let tasksAndConditions = conditionNames.map((conditionName, idx) => ({
    conditionName,
    prompt: prompts[idx],
    task: getTask(prompts[idx]),
  }));
  return [
    WelcomeScreen,
    getIntroSurvey(tasksAndConditions),
    ...getPrewritingScreens(tasksAndConditions),
    getPrewritingSurvey(tasksAndConditions),
    ...getFinalWritingScreens(tasksAndConditions),
    getClosingSurvey(tasksAndConditions),
    DoneScreen,
  ];
}

const ControlledInputView = iobs(
  ({ state, name }) => state.controlledInputs.get(name) || ""
);

function getTask(promptName) {
  if (promptName === "reviewRestaurant") {
    const nameField = "restaurant-name";
    return {
      writingType: {
        singular: "a restaurant review",
        plural: "restaurant reviews",
      },
      nameField,
      prewriteHeader: () => (
        <div>
          <h1>
            Pre-writing for your review of{" "}
            <i>
              <ControlledInputView name={nameField} />
            </i>
          </h1>
          <p>Before you write a review, let's do a little brainstorming:</p>
          <p
            style={{
              border: "1px solid black",
              padding: "5px",
              fontSize: "14pt",
            }}
          >
            Imagine someone is interviewing you about your experience.{" "}
            <b>What questions could they ask you?</b>
          </p>
          <ul>
            <li>Try to list as many as you can.</li>
            <li>Go for quantity, not quality.</li>
          </ul>
          <p>You can click Add or press Enter to add a question.</p>
        </div>
      ),
      precommitScreen: {
        screen: "Precommit",
        view: () => (
          <div className="Survey">
            <span>
              Think of a restaurant (or bar, cafe, diner, etc.) that you've been
              to recently that you <b>haven't written about before</b>.
            </span>
            <div
              style={{
                borderBottom: "1px solid black",
                padding: "12px",
                lineHeight: 1.5,
              }}
            >
              Name: <ControlledInput name={nameField} />
              <br />
              About how long ago did you visit, in days?{" "}
              <ControlledInput
                name={"restaurant-daysAgo"}
                type="number"
                min="0"
              />
              <br />
              How would you rate it?{" "}
              <ControlledStarRating name={"restaurant-star"} />
            </div>
            <NextBtn />
          </div>
        ),
      },
    };
  } else if (promptName === "persuadeMovie") {
    return {
      writingType: {
        singular: "a movie endorsement",
        plural: "movie endorsements",
      },
      prewriteHeader: () => <div />,
    };
  } else if (promptName === "informNews") {
    return {
      writingType: {
        singular: "a news article",
        plural: "news articles",
      },
      prewriteHeader: () => <div />,
    };
  } else {
    console.assert("Unknown prompt", promptName);
  }
}

function getIntroSurvey(tasksAndConditions) {
  return {
    screen: "IntroSurvey",
    view: surveyView({
      title: "Overview",
      basename: "intro",
      questions: [
        {
          type: "text",
          text: (
            <div>
              You'll be writing {tasksAndConditions.length} types of things
              today:
              <ul>
                {tasksAndConditions.map(({ prompt, task }) => (
                  <li key={prompt}>{task.writingType.singular}</li>
                ))}
              </ul>
              We'll walk you through the process;{" "}
              <b>do all your work within this window</b>.
            </div>
          ),
        },
      ],
    }),
  };
}

function getPrewritingScreens(tasksAndConditions) {
  const getPrewriteScreen = (idx, task, conditionName) => ({
    preEvent: setupTrialEvent(
      `prewrite-${idx}`,
      conditionName,
      {} /*task.flags*/
    ),
    screen: "ExperimentScreen",
    timer: task.prewriteMinutes * 60,
    view: () => (
      <div style={{ maxWidth: "1000px", margin: "0 auto" }}>
        {task.prewriteHeader()}
        <div style={{ display: "flex", flexFlow: "col nowrap" }}>
          <div style={{ flex: "1 0 auto" }}>
            <b>Ideas</b>
            <SmartIdeaList />
          </div>
          <InspirationBox />
        </div>
        <p>
          Some people came up with more than 20 ideas. How many can you come up
          with?
        </p>
        <NextBtn />
      </div>
    ),
  });

  let result = [];
  tasksAndConditions.forEach(({ prompt, conditionName, task }, idx) => {
    // TODO: show the study progress
    if (task.precommitScreen) {
      result.push(task.precommitScreen);
    }
    result.push(getPrewriteScreen(idx, task, conditionName));
  });
  return result;
}

function getPrewritingSurvey(tasksAndConditions) {
  return {
    screen: "PrewritingSurvey",
    view: surveyView({
      title: "midway survey",
      basename: "prewriting",
      questions: [],
    }),
  };
}

function getFinalWritingScreens(tasksAndConditions) {
  const getFinalWritingScreen = (header, minutes) => ({
    preEvent: {
      type: "switchToTrial",
      name: `FIXME`, // FIXME: switch back to the correct named trial.
    },
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

  return tasksAndConditions.map(({ prompt, conditionName }) =>
    getFinalWritingScreen(prompt, 4)
  );
}

function getClosingSurvey(tasksAndConditions) {
  return {
    screen: "PostExpSurvey",
    view: surveyView({
      title: "Closing Survey",
      basename: "postExp",
      questions: [
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
  };
}

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

let conditionOrders = shuffle.permutator(baseConditions);

export function createTaskState(loginEvent: {
  participant_id: string,
  assignment: number,
  prompt: string,
}) {
  let clientId = loginEvent.participant_id;

  let prompts,
    conditions,
    isDemo = false;
  if (clientId.slice(0, 4) === "demo") {
    // Demo URLs are formatted: `demo(config)-(condition)-(prompt)-p`
    let match = clientId.match(/^demo(\w+)-(\w+)-(\w+)$/);
    console.assert(match);
    let condition = match[2];
    conditions = [condition, condition, condition];
    prompts = [match[3]];
    isDemo = true;
  } else {
    conditions = conditionOrders[loginEvent.assignment];
    prompts = ["reviewRestaurant", "persuadeMovie", "informNews"];
  }

  // Get task setup.
  let screens = getScreens(prompts, conditions, isDemo);

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
