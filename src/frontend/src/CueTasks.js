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

import { getDemoConditionName, finalDataLogger, iobs } from "./misc";
import { WriterView, SpyView } from "./DesktopPhraseView";

function surveyView(props) {
  return () => React.createElement(Survey, props);
}

const namedConditions = {
  norecs: { recType: null },
  staticPhrases: { recType: "staticPhrases" },
  staticSentences: { recType: "staticSentences" },
  questions: { recType: "questionCue" },
};
let baseConditions = ["norecs", "staticSentences", "staticPhrases"];

//movie:  "Write a review of a movie or TV show you watched recently.",

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

const reviewClosingSurvey = reviewType => ({
  screen: "PostExpSurvey",
  view: surveyView({
    title: "Closing Survey",
    basename: "postExp",
    questions: [
      SurveyData.verbalized_during,
      SurveyData.numericResponse({
        name: "howManyReviewsWritten",
        text: `About how many online reviews (of ${reviewType} or otherwise) have you written in the past 3 months, excluding this one?`,
      }),
      ...demographicsSurvey,
      ...finalSurveyQuestions,
    ],
  }),
});

const WelcomeScreen = { screen: "Welcome", view: Views.Welcome };
const DoneScreen = { screen: "Done", view: Views.Done };

const restaurantTask = {
  getScreens(conditionName: string, demo = false): Screen[] {
    let trial = trialScreen({
      name: `final-0`,
      condition: conditionName,
      HeaderComponent: reviewHeader("restaurantName", 125),
    });
    if (demo) return [trial];
    return [
      WelcomeScreen,
      {
        screen: "SelectRestaurant",
        view: () => (
          <div>
            Think of a restaurant (or bar, cafe, diner, etc.) that you've been
            to recently that you <b>haven't written about before</b>.
            <RestaurantPrompt />
            <NextBtn />
          </div>
        ),
      },
      trial,
      reviewClosingSurvey("restaurants"),
      DoneScreen,
    ];
  },
};

const movieTask = {
  getScreens(conditionName: string): Screen[] {
    return [
      WelcomeScreen,
      {
        screen: "SelectMovie",
        view: () => (
          <div>
            Think of a movie or TV show that you've recently watched and haven't
            written about before.
            <div>
              <p>
                Name of the movie or TV show:{" "}
                <ControlledInput name={"movieName"} />
              </p>
              <p>
                About how long ago did you watch it, in days?{" "}
                <ControlledInput name={"watchDaysAgo"} type="number" min="0" />
              </p>
              <p>
                How would you rate it? <ControlledStarRating name={"star"} />
              </p>
            </div>
            <NextBtn />
          </div>
        ),
      },
      trialScreen({
        name: `final-0`,
        condition: conditionName,
        HeaderComponent: reviewHeader("movieName", 125),
      }),
      reviewClosingSurvey("movies"),
      DoneScreen,
    ];
  },
};

const trialView = HeaderComponent =>
  inject("clientKind")(
    observer(({ clientKind }) => {
      if (clientKind === "p") {
        return (
          <div>
            <HeaderComponent />
            <WriterView />
          </div>
        );
      } else if (clientKind === "c") {
        return <SpyView />;
      }
    })
  );

const StaticCues = iobs(({ state }) => {
  let { experimentState } = state;
  let { staticCues, flags } = experimentState;
  let { recType } = flags;
  let suffix =
    recType === "staticPhrases" ? (
      <span>&hellip;&rdquo;</span>
    ) : (
      <span>&rdquo;</span>
    );
  if (staticCues) {
    return (
      <div>
        <p>
          <b>Ideas</b> based on reviews from other people
        </p>
        <ul>
          {staticCues.map((cue, i) => (
            <li key={i}>
              &ldquo;{cue}
              {suffix}
            </li>
          ))}
        </ul>
      </div>
    );
  } else {
    return false;
  }
});

const reviewHeader = (controlledInputName, targetWords) =>
  iobs(({ state }) => (
    <div>
      <h1>
        Your review of <i>{state.controlledInputs.get(controlledInputName)}</i>
      </h1>
      <p>Write your review below. A few guidelines:</p>
      <ul>
        <li>
          Try to discuss as many different topics/aspects as you can think of.
        </li>
        <li>
          Aim for about {targetWords} words (you're at{" "}
          {state.experimentState.wordCount}).
        </li>
        <li>
          <strong>Reviews must be written from scratch in this window</strong>;
          using an already-written review or copying and pasting from a
          different app is not allowed.
        </li>
      </ul>
      <StaticCues />
    </div>
  ));

function trialScreen(props: {
  name: string,
  condition: string,
  HeaderComponent: React.Component,
  flags: ?Object,
}) {
  let { name, condition, flags, HeaderComponent } = props;
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
    view: trialView(HeaderComponent),
  };
}

export function createTaskState(loginEvent) {
  let clientId = loginEvent.participant_id;

  let screens;
  let demoConditionName = getDemoConditionName(clientId);
  if (demoConditionName != null) {
    screens = restaurantTask.getScreens(demoConditionName, true);
  } else {
    // if ("n_conditions" in loginEvent) {
    //   console.assert(loginEvent.n_conditions === conditionOrders.length);
    // }
    // Between-subjects for prompt (passed as config option) and condition (passed as counterbalanced assignment).
    let condition = baseConditions[loginEvent.assignment];
    let conditions = [condition];
    let prompt = loginEvent.prompt;
    console.log("Prompt: ", prompt);
    let task;
    if (prompt === "restaurant") task = restaurantTask;
    else if (prompt === "movie") task = movieTask;
    else console.assert(`Unknown prompt ${prompt}`);
    screens = task.getScreens(conditions);
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
  console.assert(screenDesc.view);
  return React.createElement(screenDesc.view);
}
