import range from "lodash/range";

const blankRec = { words: [] };

export const gatingSuggestionFilter = (suggestions, experimentState) => {
  let reply = experimentState.lastSuggestionsFromServer;
  if ("show" in reply && !reply.show) {
    return { predictions: range(3).map(() => blankRec) };
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
