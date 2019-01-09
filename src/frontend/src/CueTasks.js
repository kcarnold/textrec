/**
 * @format
 * @flow
 */

import * as React from "react";
import { observer, inject } from "mobx-react";

import flatMap from "lodash/flatMap";
import range from "lodash/range";
import { createState } from "./MasterState";
import { TrialState } from "./CueTrialState";
import * as Views from "./CueViews";
import { NextBtn } from "./BaseViews";
import { Survey, likert } from "./SurveyViews";
import * as SurveyData from "./SurveyData";
import { ControlledInput, ControlledStarRating } from "./ControlledInputs";

import { getDemoConditionName, finalDataLogger } from "./misc";
import { Editable } from "./Editable";

import * as shuffle from "./shuffle";

const iobs = fn => inject("state", "dispatch")(observer(fn));

const TAB_KEYCODE = 9;

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

const namedPrompts = {
  restaurant: {
    name: "restaurant",
    text: "Write a review of a restaurant you visited recently.",
  },

  /**
  {
    name: "movie",
    text: "Write a review of a movie or TV show you watched recently.",
  },

  {
    name: "home",
    text:
      "Write a description of a home or apartment that you're very familiar with.", // TODO: for someone to visit...?
  },
  */
};

let basePrompts = ["restaurant"];

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
    /*    {
      screen: "Instructions",
      view: () => (
        <div>
          Now we'll be using
          <h1>Keyboard Design {block + 1}</h1>
          <NextBtn />
        </div>
      ),
    },*/
    trialScreen({
      name: `final-${block}`,
      condition: conditionName,
      prompt,
    }) /*
    {
      screen: "PostTaskSurvey",
      view: surveyView({
        title: `Survey for Keyboard Design ${block + 1}`,
        basename: `postTask-${block}`,
        questions: [SurveyData.techDiff, SurveyData.otherMid],
      }),
    },*/,
  ];
}

function getDemoScreens(condition: string) {
  return basePrompts.map((promptName, idx) =>
    trialScreen({
      name: `final-${idx}`,
      condition,
      prompt: namedPrompts[promptName],
    })
  );
}

const StudyDesc = () => (
  <div>
    <h1>Study Preview</h1>
    <p>TODO</p>
    Ready to get started? <NextBtn />
  </div>
);

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

function getScreens(conditionName: string): Screen[] {
  let result = [
    { screen: "Welcome" },
    // {
    //   screen: "IntroSurvey",
    //   view: surveyView(introSurvey()),
    // },
    {
      screen: "SelectRestaurant",
      view: () => (
        <div>
          Think of a restaurant (or bar, cafe, diner, etc.) that you've been to
          recently that you <b>haven't written about before</b>.
          <RestaurantPrompt />
          <NextBtn />
        </div>
      ),
    },
    // { screen: "StudyDesc", view: StudyDesc },
    ...experimentBlock(0, conditionName, namedPrompts["restaurant"]),

    {
      screen: "PostExpSurvey",
      view: surveyView(closingSurvey()),
    },
    { screen: "Done" },
  ];
  return result;
}

function trialView(props) {
  return inject("clientKind")(
    observer(({ clientKind }) => {
      if (clientKind === "p") {
        return <WriterView />;
      } else if (clientKind === "c") {
        return <SpyView />;
      }
    })
  );
}

const SugEditor = ({ text, onChange }) => {};

const SpyView = iobs(({ state, dispatch }) => {
  let { curText, range, suggestions } = state.experimentState;

  return (
    <div>
      <div>{curText}</div>
      {suggestions.map((suggestion, idx) => (
        <div key={idx}>
          <input
            type="text"
            onChange={event =>
              dispatch({ type: "setSuggestion", idx, text: event.target.value })
            }
            value={suggestion.text}
          />
        </div>
      ))}
    </div>
  );
});

const WriterView = iobs(({ state, dispatch }) => {
  let { curText, range, caret, suggestions } = state.experimentState;

  const onKeyDown = evt => {
    if (evt.which === TAB_KEYCODE) {
      evt.preventDefault();
      evt.stopPropagation();
      console.log("TAB");
      dispatch({ type: "insertSugWord" });
    }
  };
  let { top, left } = caret || { top: 0, left: 0 };
  return (
    <div>
      <h1>
        Your review of <i>{state.controlledInputs.get("restaurantName")}</i>
      </h1>
      <p>Write your review below. Aim to approximately fill the text box.</p>
      <div style={{ position: "relative" }}>
        <Editable
          range={range}
          text={curText}
          onChange={newVals => {
            dispatch({
              type: "setText",
              text: newVals.text,
              range: newVals.range,
              caret: newVals.caret,
            });
            console.log(newVals);
          }}
          onKeyDown={onKeyDown}
        />
        <div
          style={{
            position: "absolute",
            top: top + 20,
            left,
            color: "grey",
          }}
        >
          {suggestions.map((suggestion, idx) => (
            <div key={idx}>{suggestion.text}</div>
          ))}
        </div>
      </div>
      <NextBtn>Submit</NextBtn>
    </div>
  );
});

function trialScreen(props: {
  name: string,
  condition: string,
  flags: ?Object,
  prompt: Prompt,
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
    view: trialView({}),
  };
}

//let conditionOrders = shuffle.permutator(baseConditions);

export function createTaskState(loginEvent) {
  let clientId = loginEvent.participant_id;

  let screens, prompts;
  let demoConditionName = getDemoConditionName(clientId);
  if (demoConditionName != null) {
    screens = getDemoScreens(demoConditionName);
  } else {
    // if ("n_conditions" in loginEvent) {
    //   console.assert(loginEvent.n_conditions === conditionOrders.length);
    // }
    // Between-subjects for prompt and condition.
    let condition = baseConditions[loginEvent.assignment];
    let conditions = [condition];
    prompts = basePrompts.slice();
    screens = getScreens(conditions, prompts);
  }

  let state = createState({
    clientId,
    screens,
    createExperimentState: flags => new TrialState(flags),
    timeEstimate: "20-25 minutes",
  });
  finalDataLogger(state);

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
