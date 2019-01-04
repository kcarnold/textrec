/**
 * @format
 * @flow
 */

import { extendObservable, observable, action } from "mobx";
import {
  platformTracking,
  pingTracking,
  sizeTracking,
  controlledInputsTracking,
  screenTracking,
} from "./SubStores";

function handleEvent(state, event) {
  state.lastEventTimestamp = event.jsTimestamp;

  let sideEffects = [];
  state.eventHandlers.forEach(fn => {
    let res = fn(state, event) || [];
    if (res.length) {
      sideEffects = sideEffects.concat(res);
    }
  });
  return sideEffects;
}

class MasterStateStore {
  constructor(config: Config) {
    this.clientId = config.clientId;
    this.config = config;
    this.eventHandlers = [];

    extendObservable(this, {
      handleEvent: action(event => handleEvent(this, event)),
      lastEventTimestamp: null,
      replaying: true,
      get timeEstimate() {
        return this.config.timeEstimate;
      },
    });
  }
}

export function createState(config: Config) {
  let state = new MasterStateStore(config);
  platformTracking(state);
  pingTracking(state);
  sizeTracking(state);
  controlledInputsTracking(state);
  screenTracking(config.screens)(state);
  return state;
}
