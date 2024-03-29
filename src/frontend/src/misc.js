/** @format */
import range from "lodash/range";
import { observer, inject } from "mobx-react";

const blankRec = { words: [] };
const blankRecs = range(3).map(() => blankRec);

export const gatingSuggestionFilter = (suggestions, experimentState) => {
  let reply = experimentState.lastSuggestionsFromServer;
  if ("show" in reply && !reply.show) {
    return { predictions: blankRecs };
  }
  return suggestions;
};

export const MAX_PING_TIME = 400;

export function getDemoConditionName(clientId: string): ?string {
  let match = clientId.match(/^demo(\w+)-(\w+)$/);
  if (match) {
    return match[2];
  }
  return null;
}

const defaultFinalDataHandler = state => {
  let trialData = [];
  state.experiments.forEach((expState, expName) => {
    trialData.push({
      name: expName,
      ...expState.getSerialized(),
    });
  });
  let finalData = {
    screenTimes: state.screenTimes.map(screen => ({
      ...screen,
      name: state.screens[screen.num].screen,
    })),
    controlledInputs: [...state.controlledInputs.toJS()],
    trialData,
  };
  return finalData;
};

export const finalDataLogger = (state, callback = defaultFinalDataHandler) => {
  state.eventHandlers.push((state, event) => {
    if (event.type === "next") {
      let delta = event.delta || 1;
      if (delta === 1 && state.screenNum === state.screens.length - 1) {
        return [
          {
            type: "finalData",
            finalData: callback(state),
          },
        ];
      }
    }
    return [];
  });
};

export const iobs = fn => inject("state", "dispatch")(observer(fn));
