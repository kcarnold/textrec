/**
 * @format
 */

import * as React from "react";
import { extendObservable, decorate, action } from "mobx";
import { observer, inject } from "mobx-react";

import flatMap from "lodash/flatMap";
import range from "lodash/range";
import { createState } from "./MasterState";
import { ExperimentStateStore } from "./IOExperimentState";
import * as Views from "./CueViews";
import { NextBtn } from "./BaseViews";
import { Survey, likert, surveyView } from "./SurveyViews";
import * as SurveyData from "./SurveyData";
import {
  ControlledInput,
  ControlledStarRating,
  ControlledInputView,
  withValidation,
} from "./ControlledInputs";
import {
  getDemoConditionName,
  gatingSuggestionFilter,
  finalDataLogger,
  iobs,
} from "./misc";

import * as shuffle from "./shuffle";

let baseConditions = ["verbatim", "template", "questions"];
let conditionOrders = shuffle.permutator(baseConditions);

export class TrialState {
  constructor(flags) {
    this.flags = flags;
    extendObservable(this, {
      curText: "",
    });
  }

  handleEvent(event) {
    let sideEffects = [];
    if (event.type === "setText") {
      this.curText = event.text;
    }

    return sideEffects;
  }

  getSerialized() {
    return {
      curText: this.curText,
    };
  }
}

decorate(TrialState, {
  handleEvent: action.bound,
});

const WelcomeScreen = { screen: "Welcome", view: Views.Welcome };
const DoneScreen = { screen: "Done", view: Views.Done };

function getScreens(prompts, conditionNames, isDemo) {
  let tasksAndConditions = prompts.map((conditionName, idx) => ({
    conditionName: conditionNames[idx],
    prompt: prompts[idx],
    task: getTask(prompts[idx]),
  }));
  //   if (isDemo) return getPrewritingScreens(tasksAndConditions);
  return [
    WelcomeScreen,
    // getIntroSurvey(tasksAndConditions),
    getPrecommitScreen(tasksAndConditions),
    ...getExperimentBlocks(tasksAndConditions),
    getClosingSurvey(tasksAndConditions),
    DoneScreen,
  ];
}

function getTask(promptName) {
  if (promptName === "travelGuide") {
    const nameField = "destination-name";

    return {
      flags: {
        domain: "wikivoyage",
      },
      writingType: {
        singular: "travel guide",
        plural: "travel guides",
      },
      visibleName: "travel destination",
      nameField,
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
  } else if (promptName.startsWith("wiki")) {
    let topicNameCode = promptName.slice(5);
    const nameField = `${topicNameCode}-name`;
    const visibleNameMap = {
      book: "book",
      film: "film",
      musician: "musician",
      television: "TV show",
    };
    console.assert(topicNameCode in visibleNameMap);
    const visibleName = visibleNameMap[topicNameCode];

    return {
      flags: {
        domain: promptName,
      },
      visibleName,
      writingType: {
        singular: `an encyclopedia-style article about a ${visibleName}`,
        plural: `encyclopedia-style articles`,
      },
      nameField,
      topicName: <ControlledInputView name={nameField} />,
      precommitView: withValidation([nameField], () => (
        <div>
          <p>
            Name a <b>{visibleName}</b> that you know well.
          </p>
          <div
            style={{
              padding: "12px",
              lineHeight: 1.5,
            }}
          >
            Name of {visibleName}: <ControlledInput name={nameField} />
          </div>
        </div>
      )),

      ideaSource: (
        <span>
          Wikipedia articles, available under the{" "}
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
  } else {
    console.assert("Unknown prompt", promptName);
  }
}

const placeholderScreen = title => ({
  screen: "placeholder",
  view: () => <h1>{title}</h1>,
});

const getExperimentBlocks = tasksAndConditions => {
  return [placeholderScreen("Experiment")];
};

function getClosingSurvey(tasksAndConditions) {
  return {
    screen: "PostExpSurvey",
    view: surveyView({
      title: "Closing Survey",
      basename: "postExp",
      questions: [
        SurveyData.age,
        SurveyData.gender,
        SurveyData.english_proficiency,
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

export function createTaskState(loginEvent: LoginEvent) {
  let clientId = loginEvent.participant_id;

  let prompts,
    conditions,
    isDemo = false;
  if (clientId.slice(0, 4) === "demo") {
    // Demo URLs are formatted: `demo(config)-(condition)-(prompt)-p`
    let match = clientId.match(/^demo(\w+)-(\w+)-([-\w]+)$/);
    console.assert(match);
    let condition = match[2];
    conditions = [condition, condition, condition];
    prompts = [match[3]];
    isDemo = true;
  } else {
    if ("n_groups" in loginEvent) {
      console.assert(loginEvent.n_groups === conditionOrders.length);
    } else {
      // showall doesn't provide n_groups because it doesn't talk with the backend.
      console.assert(window.location.search.includes("showall"));
    }
    conditions = conditionOrders[loginEvent.assignment];
    prompts = ["wiki-book", "wiki-film", "travelGuide"];
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

const getPrecommitScreen = tasksAndConditions => ({
  screen: "Precommit",
  view: () => (
    <div className="Survey">
      <h1>Pick what to write about</h1>
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
