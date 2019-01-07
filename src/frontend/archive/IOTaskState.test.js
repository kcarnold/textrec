/** @format */

import * as IOTaskState from "./IOTaskState";

it("boots", () => {
  let clientId = "abc123";
  let screens = [];
  let handleEvent = () => {};

  let state = new IOTaskState.MasterStateStore({
    clientId,
    screens,
    handleEvent,
    timeEstimate: "20-25 minutes",
  });

  state.handleEvent({
    type: "controlledInputChanged",
    name: "test",
    value: 123,
  });

  expect([...state.controlledInputs]).toEqual([["test", 123]]);
});
