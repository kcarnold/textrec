// @flow

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

export type Event =
  | TapSuggestion
  | TapKey
  | TapBackspace
  | UpdateSuggestions
  | Deleting
  | RPCRequest
  | Undo;

export type Timestamped = {| jsTimestamp: number |};

export type TSEvent = {|
  ...Event,
  ...Timestamped,
|};
