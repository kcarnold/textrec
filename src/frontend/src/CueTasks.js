/**
 * @format
 * @flow
 */

import * as React from "react";
import { observer, inject } from "mobx-react";

import { createState } from "./MasterState";
import { TrialState } from "./CueTrialState";
import * as Views from "./CueViews";
import { NextBtn } from "./BaseViews";
import { Survey } from "./SurveyViews";
import * as SurveyData from "./SurveyData";
import { ControlledInput, ControlledStarRating } from "./ControlledInputs";

import { getDemoConditionName, finalDataLogger } from "./misc";
import { Editable } from "./Editable";

const iobs = fn => inject("state", "dispatch")(observer(fn));

const TAB_KEYCODE = 9;

function surveyView(props) {
  return () => React.createElement(Survey, props);
}

const namedConditions = {
  norecs: { recType: null },
  phrases: { recType: "phraseCue" },
  questions: { recType: "questionCue" },
};
let baseConditions = ["norecs", "norecs", "norecs"];

//movie:  "Write a review of a movie or TV show you watched recently.",

const closingSurvey = () => ({
  title: "Closing Survey",
  basename: "postExp",
  questions: [
    SurveyData.verbalized_during,
    SurveyData.numericResponse({
      name: "howManyReviewsWritten",
      text:
        "About how many online reviews (of restaurants or otherwise) have you written in the past 3 months, excluding this one?",
    }),
    SurveyData.age,
    SurveyData.gender,
    SurveyData.english_proficiency,
    SurveyData.techDiff,
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
});

function experimentBlock(block: number, conditionName: string): Array<Screen> {
  return [
    trialScreen({
      name: `final-${block}`,
      condition: conditionName,
    }),
  ];
}

function getDemoScreens(condition: string) {
  return [
    trialScreen({
      name: `final-0`,
      condition,
    }),
  ];
}

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
    ...experimentBlock(0, conditionName),

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

const SpyView = iobs(({ state, dispatch }) => {
  let { curText, range, suggestions } = state.experimentState;

  let beforeCursor = curText.slice(0, range.start);
  let selected = curText.slice(range.start, range.end);
  let afterCursor = curText.slice(range.end);

  return (
    <div>
      <div>
        {beforeCursor}
        <span
          style={{
            minWidth: "2px",
            height: "17px",
            background: "blue",
          }}
        >
          {selected}
        </span>
        <span className="Cursor" />
        {afterCursor}
      </div>
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
      <p>
        Write your review below. Aim for about 125 words (you're at{" "}
        {state.experimentState.wordCount}).
      </p>
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
}) {
  let { name, condition, flags } = props;
  if (!(condition in namedConditions)) {
    throw new Error(`Invalid condition name: ${condition}`);
  }
  return {
    preEvent: {
      type: "setupTrial",
      name,
      flags: {
        condition,
        ...namedConditions[condition],
        ...flags,
      },
    },
    screen: "ExperimentScreen",
    view: trialView({}),
  };
}

export function createTaskState(loginEvent) {
  let clientId = loginEvent.participant_id;

  let screens;
  let demoConditionName = getDemoConditionName(clientId);
  if (demoConditionName != null) {
    screens = getDemoScreens(demoConditionName);
  } else {
    // if ("n_conditions" in loginEvent) {
    //   console.assert(loginEvent.n_conditions === conditionOrders.length);
    // }
    // Between-subjects for prompt (passed as config option) and condition (passed as counterbalanced assignment).
    let condition = baseConditions[loginEvent.assignment];
    let conditions = [condition];
    let prompt = loginEvent.prompt;
    console.log("Prompt: ", prompt);
    screens = getScreens(conditions);
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
