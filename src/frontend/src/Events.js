/**
 * @flow
 * @format
 */

export type Next = {| type: "next", delta?: number |};
export type TapSuggestion = {|
  type: "tapSuggestion",
  which: string,
  slot: number,
|};
export type TapKey = {| type: "tapKey", key: string, x: ?number, y: ?number |};
export type TapBackspace = {| type: "tapBackspace", delta: number |};
export type Deleting = {| type: "updateDeleting", delta: number |};
export type UpdateSuggestions = {| type: "backendReply", msg: any |}; // NOTE: This won't work if we get other RPCs.
export type RPCRequest = {| type: "rpc", rpc: any |};
export type Undo = {| type: "undo" |};
export type LoginEvent = {|
  type: "login",
  participant_id: string,
  n_conditions: number,
  assignment: number,
|};
export type FinalDataEvent = {| type: "finalData", finalData: any |};
export type TextVisibility = {| type: "textVisibility", visible: boolean |};

export type Event =
  | Next
  | TapSuggestion
  | TapKey
  | TapBackspace
  | UpdateSuggestions
  | Deleting
  | RPCRequest
  | Undo
  | LoginEvent
  | FinalDataEvent
  | TextVisibility;

export type Timestamped = {| jsTimestamp: number |};

export type TSEvent = {|
  ...Event,
  ...Timestamped,
|};

export type SideEffects = $ReadOnlyArray<Event>;
