// @flow
import "core-js/fn/array/from";

import * as React from "react";
import { observer, inject } from "mobx-react";

import flatMap from "lodash/flatMap";
import range from "lodash/range";
import * as IOTaskState from "./IOTaskState";
import * as Views from "./IOViews";
import { NextBtn } from "./BaseViews";
import { Survey, likert } from "./SurveyViews";
import * as SurveyData from "./SurveyData";
import traitData from "./TraitData";
import stimulusPairs from "./stimulusPairs";
import { gatingSuggestionFilter } from './misc';

import { seededShuffle } from "./shuffle";

import type { Screen } from "./IOTaskState";

const iobs = fn => inject("state", "dispatch")(observer(fn));

function surveyView(props) {
  return () => React.createElement(Survey, props);
}

type Stimulus = {
  type: "img",
  content: number,
  url: string,
};

let baseStimuli: Stimulus[] = stimulusPairs.map(([stim, foil]) => ({
  type: "img",
  content: stim.id,
  url: stim.url,
}));

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

const namedConditions = {
  perfect: {
    requestFlags: {},
    modelSeesStimulus: true,
    onlyShowIfAccurate: true,
  },

  lowConfidence: {
    requestFlags: {
      threshold: -0.45656539 // From Gating notebook
    },
    modelSeesStimulus: true,
  },

  highConfidence: {
    requestFlags: {
      threshold: -2.12771965
    },
    modelSeesStimulus: true,
  }
};

const StimulusView = ({ stimulus }) => {
  /* eslint-disable jsx-a11y/img-redundant-alt */
  return (
    <div>
      <img
        src={stimulus.url}
        style={{ width: "100%" }}
        alt="(image to caption should display here)"
      />
    </div>
  );
  /* eslint-enable jsx-a11y/img-redundant-alt */
};

const allStimuli: Stimulus[] = [
  ...baseStimuli,
  ...tutorialStimuli.map(x => x.stimulus),
];
export const allStimuliContent = allStimuli.map(x => x.content);
// console.log("All stimuli: ", allStimuliContent.join(","));
const PreloadView = () => (
  <div style={{ position: "absolute" }}>
    {allStimuli.map(({ content, url }) => (
      <div
        key={content}
        style={{
          background: `url(${url}) no-repeat -9999px -9999px`,
          width: "1px",
          height: "1px",
          display: "inline-block",
        }}
      />
    ))}
  </div>
);

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

        <b>Type this caption:</b>
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
  return tutorialStimuli.map((tutorialStimulus, block) =>
    trialScreen({
      name: `practice-${block}`,
      condition: condition,
      transcribe: tutorialStimulus.transcribe.toLowerCase(),
      stimulus: tutorialStimulus.stimulus,
      instructions: TutorialInstructions(block),
    })
  );
}

function getScreens(conditions: string[], stimuli: Stimulus[]): Screen[] {
  return getDemoScreens(conditions[0]);
}

function experimentView(props) {
  return () => {
    let instructions = React.createElement(props.instructions);
    return <Views.ExperimentScreen instructions={instructions} />;
  };
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
  let suggestionFilter = null;
  const blankRec = { words: [] };
  if (namedConditions[condition].onlyShowIfAccurate) {
    suggestionFilter = (suggestions, experimentState) => {
      let transcriptionStatus = experimentState.getTranscriptionStatus();
      let correctNextWord =
        experimentState.curText.slice(experimentState.lastSpaceIdx + 1) +
        transcriptionStatus.todo.trim().split(/\s/, 1)[0];
      let anyIsCorrect = false;
      suggestions.predictions.forEach(({ words }) => {
        if (correctNextWord === words.join(' ')) anyIsCorrect = true;
      });
      if (anyIsCorrect) {
        return suggestions;
      } else {
        let predictions = range(3).map(() => blankRec);
        return { predictions };
      }
    };
  } else {
    suggestionFilter = gatingSuggestionFilter;
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
        suggestionFilter,
        ...flags,
      },
    },
    screen: "ExperimentScreen",
    view: experimentView({ instructions }),
  };
}

let baseConditions = ["gated"];

export function createTaskState(clientId: string) {
  clientId = clientId || "";

  let screens, stimuli;
  let demoConditionName = IOTaskState.getDemoConditionName(clientId);
  if (demoConditionName != null) {
    screens = getDemoScreens(demoConditionName);
  } else {
    let conditions = seededShuffle(`${clientId}-conditions`, baseConditions);
    stimuli = baseStimuli.slice();
    screens = getScreens(conditions, stimuli);
  }

  let state = new IOTaskState.MasterStateStore({
    clientId,
    screens,
    handleEvent,
    timeEstimate: "20-25 minutes",
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
