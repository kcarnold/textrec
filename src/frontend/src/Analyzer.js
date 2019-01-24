/** @format */

import _ from "lodash";

export function processLogGivenState(state, log) {
  let { participant_id } = log[0];
  let finalData = null;

  log.forEach((entry, logIdx) => {
    /** STATE UPDATE **/

    if (entry.kind !== "meta") {
      let sideEffects = state.handleEvent(entry);
      // Extract the `finalData` generated by the state so we can compare it with the logged `finalData`.
      if (sideEffects) {
        sideEffects.forEach(effect => {
          if (effect && effect.type === "finalData") {
            finalData = JSON.parse(JSON.stringify(effect.finalData));
          }
        });
      }

      // Validate the log parsing by checking that the final data matches what was logged.
      if (entry.type === "finalData") {
        let loggedFinalData = JSON.parse(JSON.stringify(entry.finalData));
        // Timestamps on the login event are ok to be inconsistent.
        finalData.screenTimes[0].timestamp =
          loggedFinalData.screenTimes[0].timestamp;
        if (!_.isEqual(loggedFinalData, finalData)) {
          console.log("loggedFinalData", loggedFinalData);
          console.log("finalData", finalData);
          console.assert(false, "finalData mismatch!");
        }
      }
    }

    // All of the below assumes we're in an experiment screen.
    let expState = state.experimentState;
    if (!expState) {
      return;
    }
    let { curText } = expState;
  });

  let isComplete = state.curScreen.screen === "Done";

  let screenTimes = state.screenTimes.map(screen => {
    let screenDesc = state.screens[screen.num];
    return {
      ...screen,
      name: screenDesc.screen,
    };
  });

  return {
    participant_id,
    isComplete,
    screenTimes,
    allControlledInputs: state.controlledInputs.toJS(),
    texts: finalData.texts,
  };
}

export function getRev(log) {
  // See docs for corresponding function in analysis_util.py
  for (let i = 0; i < log.length; i++) {
    let line = log[i];
    if (line.kind === "meta" && line.type === "init") {
      let { request } = line;
      if (request && request.git_rev) {
        return request.git_rev;
      }
    }
  }
}

export async function getOldCode(log) {
  let { participant_id, config } = log[0];
  let rev = getRev(log);
  let getApp = (await import(`./old_versions/${rev}/src/Apps.js`)).default;
  return {
    participantId: participant_id,
    rev,
    config,
    ...getApp(config),
  };
}

export async function getState(log) {
  let oldCode = await getOldCode(log);
  let loginEvent = log[0];
  if ("assignment" in loginEvent) {
    return oldCode.createTaskState(loginEvent);
  } else {
    return oldCode.createTaskState(oldCode.participantId);
  }
}

export async function analyzeLog(log) {
  let state = await getState(log);
  return processLogGivenState(state, log);
}
