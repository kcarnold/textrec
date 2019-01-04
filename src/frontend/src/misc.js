import range from "lodash/range";

const blankRec = { words: [] };
const blankRecs = range(3).map(() => blankRec);

export const gatingSuggestionFilter = (suggestions, experimentState) => {
  let reply = experimentState.lastSuggestionsFromServer;
  if ("show" in reply && !reply.show) {
    return { predictions: blankRecs };
  }
  return suggestions;
};

export const MAX_PING_TIME = 200;

export function getDemoConditionName(clientId: string): ?string {
  let match = clientId.match(/^demo(\w+)-(\w+)$/);
  if (match) {
    return match[2];
  }
  return null;
}

export const finalDataLogger = state => {
  state.eventHandlers.push((state, event) => {
    if (event.type === "next") {
      if (state.screenNum === state.screens.length - 2) {
        let finalData = {
          screenTimes: state.screenTimes.map(screen => ({
            ...screen,
            name: state.screens[screen.num].screen,
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
  });
};

