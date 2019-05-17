/**
 * @format
 */

import * as React from "react";
import { observer } from "mobx-react";

import flatMap from "lodash/flatMap";

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
    let text = newIdeaEntry.current.value.trim();
    if (text.length > 0) {
      addIdea(text);
      newIdeaEntry.current.value = "";
    }
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
    ...getFinalWritingScreens(tasksAndConditions),
    getClosingSurvey(tasksAndConditions),
    DoneScreen,
  ];
}

const ControlledInputView = iobs(
  ({ state, name }) => state.controlledInputs.get(name) || name
);

function brainstormHeader(writingPrompt, targetIdeaCount) {
  return (
    <div>
      <h1>Brainstorming</h1>
      <p>You'll be writing on the following prompt:</p>
      <p
        style={{
          border: "1px solid black",
          padding: "5px",
          fontSize: "14pt",
        }}
      >
        {writingPrompt}
      </p>
      <p>
        Before you start writing,{" "}
        <b>brainstorm some things you might include in your writing.</b>
      </p>
      <ul>
        <li>Try to list at least {targetIdeaCount} ideas.</li>
        <li>Go for quantity, not quality.</li>
        <li>You don't need complete sentences.</li>
      </ul>
      <p>You can click Add or press Enter to add an idea.</p>
    </div>
  );
}

function getTask(promptName) {
  if (promptName === "reviewRestaurant") {
    const nameField = "restaurant-name";
    const writingPrompt = (
      <span>
        Write a balanced review of{" "}
        <i>
          <ControlledInputView name={nameField} />
        </i>
        . Include both positive and negative aspects.
      </span>
    );
    return {
      writingType: {
        singular: "restaurant review",
        plural: "restaurant reviews",
      },
      writingPrompt,
      nameField,
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
      targetIdeaCount: 20,
    };
  } else if (promptName === "persuadeMovie") {
    const nameField = "movie-name";
    const writingPrompt = (
      <span>
        Write an endorsement of{" "}
        <i>
          <ControlledInputView name={nameField} />
        </i>{" "}
        that would persuade someone who generally hates that genre to watch it.
      </span>
    );

    return {
      writingType: {
        singular: "movie endorsement",
        plural: "movie endorsements",
      },
      nameField,
      writingPrompt,
      precommitScreen: {
        screen: "Precommit",
        view: () => (
          <div className="Survey">
            <span>
              What is one of your favorite movies (or TV shows, documentaries,
              etc.)?
            </span>
            <div
              style={{
                padding: "12px",
                lineHeight: 1.5,
              }}
            >
              Name: <ControlledInput name={nameField} />
              <br />
              What <i>genre</i> is it? <ControlledInput name={"movie-genre"} />
            </div>
            <NextBtn />
          </div>
        ),
      },
      targetIdeaCount: 20,
    };
  } else if (promptName === "informNews") {
    const nameField = "news-headline";
    const writingPrompt = (
      <span>
        Write the body of an article with the headline you imagined, <br />
        <br />
        &ldquo;
        <ControlledInputView name={nameField} />
        &rdquo;
        <br />
        <br /> Make up any details you need.
      </span>
    );
    return {
      writingType: {
        singular: "news article",
        plural: "news articles",
      },
      writingPrompt,
      precommitScreen: {
        screen: "Precommit",
        view: () => (
          <div className="Survey">
            <span>
              Imagine looking at the news and seeing a headline that really
              makes you happy. What is that headline?
            </span>
            <div
              style={{
                padding: "12px",
                lineHeight: 1.5,
              }}
            >
              Headline:
              <br />
              <ControlledInput name={nameField} style={{ width: "300px" }} />
            </div>
            <NextBtn />
          </div>
        ),
      },
      targetIdeaCount: 20,
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
              You'll be writing {tasksAndConditions.length} things today:
              <ul>
                {tasksAndConditions.map(({ prompt, task }) => (
                  <li key={prompt}>a {task.writingType.singular}</li>
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
    preEvent: setupTrialEvent(`trial-${idx}`, conditionName, {} /*task.flags*/),
    screen: "ExperimentScreen",
    view: iobs(({ state }) => {
      const numIdeas = state.experimentState.ideas.length;
      const { targetIdeaCount } = task;
      return (
        <div style={{ maxWidth: "1000px", margin: "0 auto" }}>
          {brainstormHeader(task.writingPrompt, targetIdeaCount)}
          <div style={{ display: "flex", flexFlow: "col nowrap" }}>
            <div style={{ flex: "1 0 auto" }}>
              <b>Ideas</b>
              <SmartIdeaList />
            </div>
            <InspirationBox />
          </div>
          <p>
            You're at {numIdeas} ideas
            {numIdeas < targetIdeaCount
              ? `; try to get to ${targetIdeaCount}`
              : "."}
          </p>
          <NextBtn disabled={numIdeas < targetIdeaCount} />
        </div>
      );
    }),
  });

  let result = [];
  tasksAndConditions.forEach(({ prompt, conditionName, task }, idx) => {
    // TODO: show the study progress
    result.push(task.precommitScreen);
  });

  result.push({
    screen: "PreSurvey",
    view: surveyView({
      title: "Survey Before Writing",
      basename: "pre",
      questions: [
        {
          type: "text",
          text: (
            <p>Here are the writing prompts you're going to work on today.</p>
          ),
        },
        ...flatMap(tasksAndConditions, ({ prompt, task }, idx) => [
          { type: "text", text: <div>Prompt: {task.writingPrompt}</div> },
          likert(
            `ease-${idx}`,
            `How easy do you think it will be to come up with ${
              task.targetIdeaCount
            } ideas for things that you might include in this writing?`,
            7,
            ["very difficult", "very easy"]
          ),
        ]),
      ],
    }),
  });
  tasksAndConditions.forEach(({ prompt, conditionName, task }, idx) => {
    // TODO: Instructions screens?
    result.push(getPrewriteScreen(idx, task, conditionName));
  });

  result.push({
    screen: "MidwaySurvey",
    view: surveyView({
      title: "Halfway survey",
      basename: "midway",
      questions: [
        {
          type: "text",
          text: (
            <p>Here are the writing prompts you have done brainstorming for.</p>
          ),
        },
        ...flatMap(tasksAndConditions, ({ prompt, task }, idx) => [
          { type: "text", text: <div>Prompt: {task.writingPrompt}</div> },
          likert(
            `ease-${idx}`,
            `How easy was it to come up with ${
              task.targetIdeaCount
            } ideas for things that you might include in this writing?`,
            7,
            ["very difficult", "very easy"]
          ),
        ]),
      ],
    }),
  });
  return result;
}

function getFinalWritingScreens(tasksAndConditions) {
  return flatMap(tasksAndConditions, ({ task, prompt, conditionName }, idx) => {
    const minutes = 4; // TODO.
    const header = (
      <div>
        <h1>Write your {task.writingType.singular}</h1>
        <p
          style={{
            border: "1px solid black",
            padding: "5px",
            fontSize: "14pt",
          }}
        >
          {task.writingPrompt}
        </p>
        <p>
          Here are the ideas you listed earlier. You are not obligated to use
          them.
        </p>
        <SmartIdeaList fixed />
        <p>
          You'll have {minutes} minutes; when the time is up, finish your
          sentence and click the Next button that will appear.
        </p>
      </div>
    );
    return [
      {
        preEvent: {
          type: "switchToTrial",
          name: `trial-${idx}`,
        },
        screen: "Instructions",
        view: () => (
          <div className="Survey">
            {header}
            <p>Click "Start" to begin.</p>
            <NextBtn>Start</NextBtn>
          </div>
        ),
      },
      {
        screen: "ExperimentScreen2",
        timer: minutes * 60,
        view: () => (
          <div style={{ maxWidth: "1000px", margin: "0 auto" }}>
            {header}
            <WritingView />
            <TimedNextBtn />
          </div>
        ),
      },
    ];
  });
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
    timeEstimate: "30 minutes",
  });
  finalDataLogger(state);

  return state;
}

export function screenToView(screenDesc: Screen) {
  console.assert(screenDesc.view);
  return React.createElement(screenDesc.view);
}
