import range from "lodash/range";

const blankRec = { words: [] };

export const gatingSuggestionFilter = (suggestions, experimentState) => {
  let reply = experimentState.lastSuggestionsFromServer;
  if ("show" in reply && !reply.show) {
    return { predictions: range(3).map(() => blankRec) };
  }
  return suggestions;
};
