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
import { Survey, likert, agreeLikert, surveyBody } from "./SurveyViews";
import * as SurveyData from "./SurveyData";
import { ControlledInput, ControlledStarRating } from "./ControlledInputs";

import { finalDataLogger, iobs } from "./misc";
import * as shuffle from "./shuffle";

const namedConditions = {
  norecs: { recType: null },
  practice: { recType: "practice" },
  randomSents: { recType: "randomSents" },
  cueSents: { recType: "cueSents" },
  cueWords: { recType: "cueWords" },
  randomWords: { recType: "randomWords" },
};

// let baseConditions = ["norecs", "randomSents", "cueSents"];
let baseConditions = ["norecs", "randomSents", "cueWords"];

const WelcomeScreen = { screen: "Welcome", view: Views.Welcome };
const DoneScreen = { screen: "Done", view: Views.Done };

function surveyView(props) {
  return () => React.createElement(Survey, props);
}

/**
 * Ideation stuff
 */

const InspirationBox = iobs(({ state, dispatch, ideaSource }) =>
  state.experimentState.flags.recType !== null ? (
    <div
      style={{
        padding: "10px",
        borderRight: "1px solid black",
        width: "350px",
        margin: "5px",
      }}
    >
      <h1 style={{ paddingTop: "0", marginTop: "0" }}>For inspiration...</h1>
      <button
        onClick={e => dispatch({ type: "inspireMe" })}
        style={{
          fontSize: "16px",
          background: "green",
          color: "white",
          padding: "10px",
          borderRadius: "10px",
        }}
      >
        <img
          src="/static/capicon-refresh.png"
          alt=""
          style={{ width: "25px", paddingRight: "5px" }}
        />
        Get fresh inspirations!
      </button>
      <br />
      {state.experimentState.suggestions.length > 0 ? (
        <div>
          <ul>
            {state.experimentState.suggestions.map((s, idx) => (
              <li key={idx} style={{ marginBottom: "5px" }}>
                {s.text}
              </li>
            ))}
          </ul>
          <p style={{ fontSize: "8pt" }}>Source: {ideaSource}</p>
        </div>
      ) : (
        <div style={{ color: "#777" }}>
          Click the button above if you're feeling stuck.
        </div>
      )}
    </div>
  ) : null
);

// Hacky: this needs to be an observer because userIdeas is an observable...
const IdeaList = observer(({ userIdeas, addIdea, placeholder }) => {
  let newIdeaEntry = React.createRef();
  if (!placeholder) placeholder = "Is this a question?";
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
      <ol>
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
              placeholder={placeholder}
            />{" "}
            <span style={{ color: "#777" }}>Press Enter to add</span>
          </li>
        )}
      </ol>
    </div>
  );
});

const SmartIdeaList = iobs(({ state, dispatch, fixed, placeholder }) => {
  function addIdea(idea) {
    dispatch({ type: "addIdea", idea });
  }
  return (
    <IdeaList
      userIdeas={state.experimentState.ideas}
      addIdea={fixed ? null : addIdea}
      placeholder={placeholder}
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

function getScreens(prompts, conditionNames, isDemo) {
  let tasksAndConditions = prompts.map((conditionName, idx) => ({
    conditionName: conditionNames[idx],
    prompt: prompts[idx],
    task: getTask(prompts[idx]),
  }));
  if (isDemo) return getPrewritingScreens(tasksAndConditions);
  return [
    WelcomeScreen,
    // getIntroSurvey(tasksAndConditions),
    getPrecommitScreen(tasksAndConditions),
    // getTutorialScreen(),
    getPracticeScreen(),
    ...getPrewritingScreens(tasksAndConditions),
    {
      screen: "MidwaySurvey",
      view: surveyView({
        title: "A quick break",
        basename: "mid",
        questions: [
          {
            type: "text",
            text: "A few questions for a quick break...",
          },
          ...SurveyData.shortNFC,
        ],
      }),
    },
    ...getFinalWritingScreens(tasksAndConditions),
    getClosingSurvey(tasksAndConditions),
    DoneScreen,
  ];
}

const getTutorialScreen = () => ({
  screen: "Tutorial",
  view: () => (
    <div>
      <NextBtn />
    </div>
  ),
});

const getPracticeScreen = () => ({
  preEvent: setupTrialEvent(`practice`, "practice", { domain: "_q" }),
  screen: "Practice",
  view: iobs(({ state }) => {
    const numIdeas = state.experimentState.ideas.length;
    const targetIdeaCount = 20;
    return (
      <div style={{ maxWidth: "1000px", margin: "0 auto" }}>
        <h1>Practice Round</h1>
        <p>
          As part of this survey, you'll be using a system that offers
          inspiration while you're brainstorming. Let's practice using it.
        </p>
        <p>
          <b>Practice Task:</b> Try to list 20 English words with "q" as the
          second letter.
        </p>
        <p>
          For this practice task, the inspiration box will show word prefixes
          that you haven't used yet.
        </p>

        <div style={{ display: "flex", flexFlow: "col nowrap" }}>
          <InspirationBox ideaSource={"the Wordfreq Python package"} />
          <div style={{ flex: "1 0 auto" }}>
            <b>Words</b>
            <SmartIdeaList placeholder="_q__" />
          </div>
        </div>
        <p>
          {numIdeas < targetIdeaCount
            ? `Try to get to ${targetIdeaCount} words.`
            : null}
        </p>
        <NextBtn disabled={numIdeas < targetIdeaCount} />
      </div>
    );
  }),
});

const ControlledInputView = iobs(
  ({ state, name }) => state.controlledInputs.get(name) || name
);

function brainstormHeader(topicName, targetIdeaCount) {
  return (
    <div>
      <h1>Preparing to Write an Encyclopedia Article</h1>
      <p>
        You're going to write a factual article about{" "}
        <span style={{ color: "orange" }}>{topicName}</span>. Think about the
        person who will read the article.
        <b>What factual questions might the reader have?</b>
      </p>

      <ul>
        <li>Goal: at least {targetIdeaCount} questions</li>
        <li>Quantity, not quality.</li>
        <li>Order doesn't matter.</li>
        <li>Complete sentences unneeded.</li>
      </ul>
    </div>
  );
}

function getTask(promptName) {
  if (promptName === "reviewRestaurant") {
    const nameField = "restaurant-name";
    const writingPrompt = (
      <span>
        Write a brief encyclopedia article about
        <i>
          <ControlledInputView name={nameField} />
        </i>{" "}
        that would be useful and interesting for a potential visitor.
        <br /> Make up any details you need.
      </span>
    );
    return {
      flags: {
        domain: "restaurant",
      },
      writingType: {
        singular: "restaurant description article",
        plural: "restaurant description articles",
      },
      writingPrompt,
      nameField,
      topicName: <ControlledInputView name={nameField} />,
      precommitView: withValidation([nameField], () => (
        <div>
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
        </div>
      )),
      targetIdeaCount: 20,
      wordCountTarget: 120,
      ideaSource: (
        <span>
          Resaurant reviews from the{" "}
          <a
            target="_blank"
            rel="noopener noreferrer"
            href="https://www.yelp.com/dataset"
          >
            Yelp Open Dataset
          </a>
        </span>
      ),
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
      flags: {
        domain: "movie",
      },
      writingType: {
        singular: "movie endorsement",
        plural: "movie endorsements",
      },
      nameField,
      writingPrompt,
      topicName: <ControlledInputView name={nameField} />,
      precommitView: withValidation([nameField], () => (
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
        </div>
      )),
      targetIdeaCount: 20,
      wordCountTarget: 120,
      ideaSource: <span>Movie reviews from IMDB</span>,
    };
  } else if (promptName === "travelGuide") {
    const nameField = "destination-name";
    const writingPrompt = (
      <span>
        Write a brief encyclopedia article about{" "}
        <i>
          <ControlledInputView name={nameField} />
        </i>{" "}
        that would be useful and interesting for a potential visitor.
        <br /> Make up any details you need.
      </span>
    );

    return {
      flags: {
        domain: "wikivoyage",
      },
      writingType: {
        singular: "travel guide",
        plural: "travel guides",
      },
      nameField,
      writingPrompt,
      topicName: <ControlledInputView name={nameField} />,
      precommitView: withValidation([nameField], () => (
        <div className="Survey">
          <span>
            What is a travel destination (city, region, national park, etc.)
            that you're familiar with?
          </span>
          <div
            style={{
              padding: "12px",
              lineHeight: 1.5,
            }}
          >
            Destination Name: <ControlledInput name={nameField} />
          </div>
        </div>
      )),

      targetIdeaCount: 20,
      wordCountTarget: 120,
      ideaSource: (
        <span>
          Articles from{" "}
          <a
            href="https://en.wikivoyage.org/wiki/Main_Page"
            target="_blank"
            rel="noopener noreferrer"
          >
            WikiVoyage
          </a>
          , available under the{" "}
          <a
            href="http://creativecommons.org/licenses/by-sa/3.0/"
            target="_blank"
            rel="noopener noreferrer"
          >
            Creative Commons Attribution-ShareAlike 3.0 licence
          </a>
          .
        </span>
      ),
    };
  } else if (promptName === "informNews") {
    const nameField = "news-headline";
    const writingPrompt = (
      <span>
        Write a brief encyclopedia article about the event,{" "}
        <i>
          <ControlledInputView name={nameField} />
        </i>{" "}
        that would be useful and interesting for a potential reader.
        <br /> Make up any details you need.
      </span>
    );
    return {
      flags: {
        domain: "news",
      },
      writingType: {
        singular: "news article",
        plural: "news articles",
      },
      writingPrompt,
      topicName: <ControlledInputView name={nameField} />,
      precommitView: withValidation([nameField], () => (
        <div className="Survey">
          <span>
            Imagine looking at the news and seeing a headline that really makes
            you happy. What is that headline?
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
        </div>
      )),

      targetIdeaCount: 20,
      wordCountTarget: 120,
      ideaSource: (
        <span>
          Articles from various sources, compiled by the{" "}
          <a
            href="https://summari.es/download/"
            target="_blank"
            rel="noopener noreferrer"
          >
            Cornell Newsroom Summaries Team
          </a>
          .
        </span>
      ),
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

const withValidation = (requiredInputs, view) => {
  return {
    view,
    complete: state => {
      for (let i = 0; i < requiredInputs.length; i++) {
        let curVal = state.controlledInputs.get(requiredInputs[i]) || "";
        if (curVal.trim().length === 0) return false;
      }
      return true;
    },
  };
};

const getPrecommitScreen = tasksAndConditions => ({
  screen: "Precommit",
  view: () => (
    <div className="Survey">
      {tasksAndConditions.map(({ task }, idx) => (
        <div key={idx} style={{ borderBottom: "1px solid black" }}>
          {task.precommitView.view()}
        </div>
      ))}
      <NextBtn
        enabledFn={state =>
          tasksAndConditions.every(({ task }) =>
            task.precommitView.complete(state)
          )
        }
      />
    </div>
  ),
});

function getPrewritingScreens(tasksAndConditions) {
  const getPrewriteScreen = (idx, task, conditionName) => ({
    preEvent: setupTrialEvent(`trial-${idx}`, conditionName, task.flags),
    screen: "ExperimentScreen",
    view: iobs(({ state }) => {
      const numIdeas = state.experimentState.ideas.length;
      const { targetIdeaCount } = task;
      return (
        <div style={{ maxWidth: "1000px", margin: "0 auto" }}>
          {brainstormHeader(task.topicName, targetIdeaCount)}
          <div style={{ display: "flex", flexFlow: "col nowrap" }}>
            <InspirationBox ideaSource={task.ideaSource} />
            <div style={{ flex: "1 0 auto" }}>
              <b>Questions the reader might have:</b>
              <SmartIdeaList />
            </div>
          </div>
          <p>
            {numIdeas < targetIdeaCount
              ? `Try to get to ${targetIdeaCount} questions.`
              : null}
          </p>
          <NextBtn disabled={numIdeas < targetIdeaCount} />
        </div>
      );
    }),
  });

  let result = [];

  result.push({
    screen: "PreSurvey",
    view: () => (
      <div className="Survey">
        <h1>Writing factual articles</h1>
        <p>
          You are going to be writing brief factual (encyclopedia-like) articles
          on the topics that you listed earlier.
        </p>
        <p>Thinking about the reader will help make you a better writer.</p>
        <p>
          In the next few screens, you'll try to come up with ideas about what
          questions someone might have about the topic before they read your
          article.
        </p>

        {surveyBody(
          "pre",
          flatMap(tasksAndConditions, ({ prompt, task }, idx) => [
            likert(
              `taskEfficacy-${idx}`,
              <span>
                {`I am confident that I can come up with at least ${
                  task.targetIdeaCount
                } questions that someone might ask me about `}
                <b>{task.topicName}</b>
              </span>,
              7,
              ["strongly disagree", "strongly agree"]
            ),
          ])
        )}

        <NextBtn />
      </div>
    ),
  });

  tasksAndConditions.forEach(({ prompt, conditionName, task }, idx) => {
    // TODO: Instructions screens?
    let surveyQuestions = [
      agreeLikert("fluent", "I felt like I could come up with ideas easily."),
      agreeLikert(
        "stuck",
        "I sometimes felt stuck thinking about what to write."
      ),
    ];
    if (conditionName !== "norecs") {
      surveyQuestions = [
        ...surveyQuestions,
        agreeLikert("sysRelevant", "The inspirations were relevant."),
        agreeLikert("sysGaveIdeas", "The inspirations gave me new ideas."),
        agreeLikert(
          "usedInspirations",
          "I used the inspirations that were given."
        ),
        // "The inspirations discussed some of the same ideas"
        {
          text: "When did you request inspiration?",
          responseType: "text",
          name: "whenRequest",
          flags: { multiline: true },
        },
      ];
    }
    surveyQuestions = [
      ...surveyQuestions,
      agreeLikert("distracting", "The system was distracting."),
      agreeLikert("system-helped", "The system was helpful overall."),
      SurveyData.techDiff,
      SurveyData.otherMid,
    ];
    result.push(getPrewriteScreen(idx, task, conditionName));
    result.push({
      screen: "PostTaskSurvey",
      view: surveyView({
        title: `Survey after Brainstorming ${idx + 1}`,
        basename: `postBrainstorm-${idx}`,
        questions: surveyQuestions,
      }),
    });
  });

  // result.push({
  //   screen: "MidwaySurvey",
  //   view: surveyView({
  //     title: "Halfway survey",
  //     basename: "midway",
  //     questions: [
  //       {
  //         type: "text",
  //         text: (
  //           <p>Here are the writing prompts you have done brainstorming for.</p>
  //         ),
  //       },
  //       ...flatMap(tasksAndConditions, ({ prompt, task }, idx) => [
  //         { type: "text", text: <div>Prompt: {task.writingPrompt}</div> },
  //         likert(
  //           `taskEfficacyPost-${idx}`,
  //           `I am confident that I can come up with at least ${
  //             task.targetIdeaCount
  //           } ideas for writing about a similar prompt in the future.`,
  //           7,
  //           ["strongly disagree", "strongly agree"]
  //         ),
  //       ]),
  //     ],
  //   }),
  // });
  return result;
}

const WordCountTargetAdvance = iobs(({ state, targetWords }) => {
  let { wordCount } = state.experimentState;
  let allowAdvance = wordCount >= targetWords;
  return (
    <div>
      <p>
        Word count: {state.experimentState.wordCount} (target: {targetWords})
        <br />
        <NextBtn disabled={state.experimentState.wordCount < targetWords}>
          {allowAdvance
            ? "Submit"
            : `Please write ${targetWords - wordCount} more words.`}
        </NextBtn>
      </p>
    </div>
  );
});

function getFinalWritingScreens(tasksAndConditions) {
  return flatMap(tasksAndConditions, ({ task, prompt, conditionName }, idx) => {
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
        <p>Aim for about {task.wordCountTarget} words.</p>
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
        view: () => (
          <div style={{ maxWidth: "1000px", margin: "0 auto" }}>
            {header}
            <WritingView />
            <WordCountTargetAdvance targetWords={task.wordCountTarget} />
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
        SurveyData.techDiff,
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
    prompts = ["reviewRestaurant", "travelGuide", "informNews"];
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
