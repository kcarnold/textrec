/** @format */

import React, { Component } from "react";
import forEach from "lodash/forEach";
import { observer, Provider } from "mobx-react";
import { ColumnDictionary } from "./SurveyViews";

let states = [];
let MasterView = null;

function handleEventWithSideEffects(state, event) {
  let sideEffects = [];
  let res = state.handleEvent(event);
  if (res.length) {
    sideEffects = sideEffects.concat(res);
  }
  // Run side-effects after all handlers have had at it.
  console.log(event, sideEffects);
  sideEffects.forEach(event => state.handleEvent(event));
}

export function init(createTaskState, MasterView_, loginEvent) {
  MasterView = MasterView_;
  let eventsSoFar = [];

  function doEventToLastState(evt) {
    eventsSoFar.push(evt);
    handleEventWithSideEffects(states[states.length - 1], evt);
  }

  function copyState() {
    let newState = createTaskState(loginEvent);
    newState.pingTime = 0;
    states.push(newState);
    eventsSoFar.forEach(evt => newState.handleEvent(evt));
    return newState;
  }
  copyState();
  doEventToLastState(loginEvent);
  let screens = states[0].screens;
  states[0].replaying = false;
  for (let i = 1; i < screens.length; i++) {
    let newState = copyState();
    doEventToLastState({ type: "next" });
    if (newState.curScreen.screen === "ExperimentScreen") {
      forEach(`${i}`, chr => {
        doEventToLastState({ type: "tapKey", key: chr });
      });
    }
    newState.replaying = false;
  }
}

const ShowAllScreens = observer(
  class ShowAllScreens extends Component {
    render() {
      function innerView(i, state, kind) {
        let dispatch = event => {
          event.jsTimestamp = +new Date();
          event.kind = kind;
          state.handleEvent(event);
        };
        return (
          <MasterView
            state={state}
            dispatch={dispatch}
            clientId={state.clientId}
            clientKind={kind}
            spying={true}
          />
        );
      }
      return (
        <div>
          {states.map((state, i) => (
            <div key={i} style={{ margin: "5px" }}>
              <div>
                <div
                  style={{
                    border: "1px solid black",
                    width: "1000px",
                  }}
                >
                  {innerView(i, state, "p")}
                </div>
              </div>
            </div>
          ))}
          <Provider state={states[states.length - 1]} dispatch={() => {}}>
            <ColumnDictionary />
          </Provider>
        </div>
      );
    }
  }
);

export default ShowAllScreens;
