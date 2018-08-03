// @flow
import "core-js/fn/array/from";

import * as React from "react";
import {
  extendObservable,
} from "mobx";
import { observer, inject } from "mobx-react";

import flatMap from "lodash/flatMap";
import range from "lodash/range";
import * as IOTaskState from "./IOTaskState";
import { ExperimentStateStore } from "./IOExperimentState";
import * as Views from "./IOViews";
import { NextBtn } from "./BaseViews";
import { Survey, likert } from "./SurveyViews";
import * as SurveyData from "./SurveyData";
import traitData from "./TraitData_NfCEDTO";
import { getDemoConditionName, gatingSuggestionFilter } from "./misc";

import * as shuffle from "./shuffle";

import type { Screen } from "./IOTaskState";

const iobs = fn => inject("state", "dispatch")(observer(fn));

const TRIALS_PER_CONDITION = 4;
const MIN_REC_THRESHOLD = 1;

function surveyView(props) {
  return () => React.createElement(Survey, props);
}

let tutorialStimuli = [
  {
    stimulus: {
      type: "img",
      content: 133707,
      url: "http://images.cocodataset.org/train2017/000000133707.jpg",
    },
    transcribe:
      "a black cat napping on a sunny unpainted wood bench in front of a red wall",
  },
  {
    stimulus: {
      type: "img",
      content: 533452,
      url: "http://images.cocodataset.org/train2017/000000533452.jpg",
    },
    transcribe:
      "a man with black hair and glasses placing a large turkey into an upper oven",
  },
  {
    stimulus: {
      type: "img",
      content: 314515,
      url: "http://images.cocodataset.org/train2017/000000314515.jpg",
    },
    transcribe:
      "a black and red vehicle with bikes on top and people standing nearby with umbrellas.",
  },
];

let baseStimuli = tutorialStimuli; // FIXME.


const namedConditions = {
  norecs: {
    requestFlags: {},
    modelSeesStimulus: false,
    hideRecs: true,
  },

  gated: {
    requestFlags: {
      threshold: -0.989417552947998, // From `scripts/compute_gating_threshold.py`
    },
    modelSeesStimulus: false,
  },

  always: {
    requestFlags: {},
    modelSeesStimulus: false,
  },
};

const CapInstructions = iobs(({ state, dispatch }) => (
  <div onClick={evt => {
    dispatch({type: 'textVisibility', visible: true}); }}>
    Tap here to show the text.
  </div>
));

const PostPractice = block =>
  iobs(({ state, dispatch }) => {
    let { eventCounts, flags } = state.experimentState;
    let totalRecs =
      (eventCounts["tapSugg_partial"] || 0) +
      (eventCounts["tapSugg_full"] || 0);
    if (flags.hideRecs) {
      return (
        <div>
          About to start typing using
          <h1>Keyboard design {block + 1}</h1>
          Tap Next when ready: <NextBtn />
        </div>
      );
    }

    if (totalRecs > MIN_REC_THRESHOLD) {
      return (
        <div>
          Great, it looks like you know how to use Keyboard Design {block + 1}!
          <p>
            <b>
              Ready to start typing using Keyboard Design {block + 1}?
            </b>
          </p>
          <NextBtn />
        </div>
      );
    } else {
      return (
        <div>
          Predictions were available, but it looks like you didn't use them.
          <button
            className="NextBtn"
            onClick={() => dispatch({ type: "next", delta: -1 })}
          >
            Try again
          </button>
        </div>
      );
    }
  });

/** Surveys **/
function splitPersonalityBlocks(numBlocks, questionsPerBlock) {
  console.assert(traitData.length === numBlocks * questionsPerBlock);
  let blocks = range(numBlocks).map(blockIdx =>
    traitData.slice(questionsPerBlock * blockIdx).slice(0, questionsPerBlock)
  );
  return blocks.map((block, idx) => [
    SurveyData.personalityHeader,
    ...shuffle
      .seededShuffle(`personality-{idx}`, block)
      .map(item => SurveyData.traitQuestion(item)),
    { text: "" },
  ]);
}

const introSurvey = personalityBlock => ({
  title: "Opening Survey",
  basename: "intro",
  questions: [
    {
      text:
        "There will be several short surveys like this as breaks from the writing task.",
    },

    // TODO: should we break this down into prediction, correction, gesture, etc.?
    {
      text: (
        <div>
          How often do you use the suggestion bar on your phone keyboard?
          <img
            src="/suggestionbar-marked.png"
            alt=""
            style={{ width: "100%" }}
          />
        </div>
      ),
      responseType: "options",
      name: "use_predictive",
      options: ["Never", "Very Rarely", "Rarely", "Often", "Almost Always"],
    },

    ...personalityBlock,
  ],
});


const helpfulRank = (attr, text) => [
  {
    text: (
      <span>
        Which keyboard design was <b>most</b> helpful for {text}?
      </span>
    ),
    responseType: "options",
    name: `helpfulRank-${attr}-most`,
    options: ["Keyboard Design 1", "Keyboard Design 2", "Keyboard Design 3"],
  },
  {
    text: (
      <span>
        Which keyboard design was <b>least</b> helpful for {text}?
      </span>
    ),
    responseType: "options",
    name: `helpfulRank-${attr}-least`,
    options: ["Keyboard Design 1", "Keyboard Design 2", "Keyboard Design 3"],
  },
];

const closingSurvey = personalityBlock => ({
  title: "Closing Survey",
  basename: "postExp",
  questions: [
    ...helpfulRank(
      "accurate",
      <span>
        typing very <b>accurately</b>
      </span>
    ),
    ...helpfulRank(
      "quick",
      <span>
        typing very <b>quickly</b>
      </span>
    ),
    ...personalityBlock,
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
          explain (in the final question).
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
  stimuli: Stimulus[],
  personalityBlock
): Array<Screen> {
  let agreeLikert = (name, prompt) =>
    likert(name, prompt, 7, ["Strongly disagree", "Strongly agree"]);
  let designQuestions = [
    agreeLikert(
      "sys-accurate",
      "This keyboard design helped me type accuratly"
    ),
    agreeLikert(
      "sys-fast",
      "This keyboard design helped me type quickly"
    ),
  ];
  let tutorialStimulus = tutorialStimuli[block];

  return [
    {
      screen: "Instructions",
      view: () => (
        <div>
          Now we'll be using
          <h1>Keyboard Design {block + 1}</h1>
          We'll start with a practice round. <NextBtn />
        </div>
      ),
    },
    trialScreen({
      name: `practice-${block}`,
      condition: conditionName,
      transcribe: tutorialStimulus.transcribe.toLowerCase(),
      stimulus: tutorialStimulus.stimulus,
      instructions: TutorialInstructions(block),
    }),
    {
      screen: "PostPractice",
      view: PostPractice(block),
    },
    ...stimuli.map((stimulus, idx) =>
      trialScreen({
        name: `final-${block}-${idx}`,
        condition: conditionName,
        stimulus: stimulus.stimulus,
        transcribe: stimulus.transcribe.toLowerCase(),
        instructions: CapInstructions,
      })
    ),
    {
      screen: "PostTaskSurvey",
      view: surveyView({
        title: `Survey for Keyboard Design ${block + 1}`,
        basename: `postTask-${block}`,
        questions: [
          ...designQuestions,
          ...SurveyData.tlxQuestions,
          ...personalityBlock,
          SurveyData.techDiff,
          SurveyData.otherMid,
        ],
      }),
    },
  ];
}

const TutorialInstructions = block =>
  iobs(({ state }) => {
    let {
      commonPrefix,
      incorrect,
      todo,
    } = state.experimentState.getTranscriptionStatus();
    return (
      <div>
        <h1>Practice with Keyboard Design {block + 1}</h1>

        <b>Type this:</b>
        <br />
        <div style={{ background: "white" }}>
          <span style={{ color: "grey" }}>{commonPrefix}</span>
          <span style={{ color: "red" }}>{incorrect}</span>
          <span>{todo}</span>
        </div>
        <NextBtn disabled={incorrect.length !== 0 || todo.length !== 0} />
      </div>
    );
  });

function getDemoScreens(condition: string) {
  return baseStimuli.map(stimulus =>
    trialScreen({
      name: `final-0`,
      condition,
      stimulus: stimulus.stimulus,
      transcribe: stimulus.transcribe.toLowerCase(),
    instructions: CapInstructions,
    })
  );
}

const TaskDescription = () => (
  <div>
    <p>
      In this study we're going to be typing captions for images.
    </p>

    <p>
      A bonus of $0.50 will be available to the fastest accurate typists!
    </p>

    <NextBtn />
  </div>
);

const StudyDesc = () => (
  <div>
    <h1>Study Preview</h1>
    <p>
      You'll use {baseConditions.length} different keyboard designs in this
      study.
    </p>
    <p>
      For each keyboard design, there will be a practice round to get used to
      it, then you'll type {TRIALS_PER_CONDITION} captions using it, and finally
      a short survey.
    </p>
    <p>
      You will type a total of {baseConditions.length * TRIALS_PER_CONDITION}{" "}
      captions.
    </p>
    <p>Note:</p>
    <ul className="spaced">
      <li>
        All of the keyboard designs have a simplified key layout: no caps, and
        only a few symbols.
      </li>
      <li>
        You can't edit text you've already entered, other than by backspacing
        and retyping it.
      </li>
      <li>
        Autocorrect doesn't work. If you make a typo, please backspace and
        correct it.
      </li>
      <li>
        At the end, you will be comparing your experiencecs between the
        different keyboards. So <b>please try to remember which is which</b>!
      </li>
    </ul>
    Ready to get started? <NextBtn />
  </div>
);

function getScreens(
  conditions: string[],
  texts: string[],
  personalityBlocks
): Screen[] {
  // Group stimuli by block.
  console.assert(texts.length >= conditions.length * TRIALS_PER_CONDITION);
  let blocks = conditions.map((condition, idx) => ({
    condition,
    texts: texts
      .slice(idx * TRIALS_PER_CONDITION)
      .slice(0, TRIALS_PER_CONDITION),
  }));

  let result = [
    { screen: "Welcome" },
    {
      screen: "IntroSurvey",
      view: surveyView(introSurvey(personalityBlocks[0])),
    },
    { screen: "TaskDescription", view: TaskDescription },
    { screen: "StudyDesc", view: StudyDesc },

    ...flatMap(blocks, (block, idx) =>
      experimentBlock(
        idx,
        block.condition,
        block.texts,
        personalityBlocks[idx + 1]
      )
    ),

    {
      screen: "PostExpSurvey",
      view: surveyView(closingSurvey(personalityBlocks[4])),
    },
    { screen: "Done" },
  ];
  return result;
}

function experimentView(props) {
  return iobs(({state, dispatch}) => {
    if (state.experimentState.textShown) {
      return <div onClick={evt => {
        dispatch({type: 'textVisibility', visible: false}); }}>{state.experimentState.transcribe}</div>;
    } else {
      let instructions = React.createElement(props.instructions);
      return <Views.ExperimentScreen instructions={instructions} />;
    }
  });
}

function trialScreen(props: {
  name: string,
  condition: string,
  flags: ?Object,
  instructions: React.ComponentType<any>,
  stimulus: Stimulus,
  transcribe: ?string,
}) {
  let { name, condition, flags, instructions, stimulus, transcribe } = props;
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
        stimulus,
        transcribe,
        suggestionFilter: gatingSuggestionFilter,
        ...flags,
      },
    },
    screen: "ExperimentScreen",
    view: experimentView({ instructions }),
  };
}

let baseConditions = ["norecs", "gated", "always"];
let conditionOrders = shuffle.permutator(baseConditions);

export function createTaskState(loginEvent) {
  let clientId = loginEvent.participant_id;

  let screens, stimuli;
  let demoConditionName = getDemoConditionName(clientId);
  if (demoConditionName != null) {
    screens = getDemoScreens(demoConditionName);
  } else {
    if ("n_conditions" in loginEvent) {
      console.assert(loginEvent.n_conditions === conditionOrders.length);
    }
    let conditions = conditionOrders[loginEvent.assignment];
    stimuli = baseStimuli.slice();
    const personalityBlocks = splitPersonalityBlocks(5, 8);
    screens = getScreens(conditions, stimuli, personalityBlocks);
  }

  let state = new IOTaskState.MasterStateStore({
    clientId,
    screens,
    handleEvent,
    timeEstimate: "20-25 minutes",
    createExperimentState: (flags) => {
      let expState = new ExperimentStateStore(flags);
      extendObservable(expState, {
        textShown: true
      });
      return expState;
    }
  });


  function handleEvent(event: Event): Event[] {
    if (event.type === "next") {
      if (state.screenNum === screens.length - 2) {
        let finalData = {
          screenTimes: state.screenTimes.map(screen => ({
            ...screen,
            name: screens[screen.num].screen,
          })),
          controlledInputs: [...state.controlledInputs.toJS()],
          texts: Array.from(
            state.experiments.entries(),
            ([expName, expState]) => ({
              name: expName,
              condition: expState.flags.condition,
              text: expState.curText,
            })
          ),
        };
        return [
          {
            type: "finalData",
            finalData,
          },
        ];
      }
    }
    if (event.type === 'textVisibility') {
      state.experimentState.textShown = event.visible;
    }
    return [];
  }

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
