// @flow

export type TapSuggestion = {
  type: "tapSuggestion",
  which: string,
  slot: number,
};
export type TapKey = { type: "tapKey", key: string };
export type TapBackspace = { type: "tapBackspace", delta: number };
export type UpdateSuggestions = {type: "updateSuggestions", msg: any};
export type Deleting = {type: "deleting", delta: number};

export type Event =
  | TapSuggestion
  | TapKey
  | TapBackspace
  | UpdateSuggestions
  | Deleting;

export type Timestamped = { jsTimestamp: number };

export type TSEvent = Event & Timestamped;
