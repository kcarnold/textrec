// @flow

export type TapSuggestion = {type: 'tapSuggestion', which: string, slot: number};
export type TapKey = {type: 'tapKey', key: string};
export type TapBackspace = {type: 'tapBackspace', delta: number};


export type Event =
  | TapSuggestion
  | TapKey
  | TapBackspace;

export type Timestamped = { timestamp: number };

export type TSEvent = Event & Timestamped;
