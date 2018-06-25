import _ from "lodash";

const blankRec = { words: [] };
const blankRecs = _.range(3).map(() => blankRec);

function getCurCondition(state) {
  return state.conditionName || state.experimentState.flags.condition;
}

export function processLogGivenState(state, log) {
  let { participant_id } = log[0];
  let byExpPage = {};
  let pageSeq = [];
  let requestsByTimestamp = {};

  function getPageData() {
    let page = state.curExperiment;
    if (!byExpPage[page]) {
      let pageData = {
        displayedSuggs: [],
        condition: getCurCondition(state),
        finalText: "",
        actions: [],
        annotatedFinalText: [],
        firstEventTimestamp: null,
        lastEventTimestamp: null,
      };
      byExpPage[page] = pageData;
      pageSeq.push(page);
    }
    return byExpPage[page];
  }

  let lastScreenNum = null;
  let tmpSugRequests = null;
  let lastDisplayedSuggs = null;
  let finalData = null;

  log.forEach((entry, logIdx) => {
    // We need to track context sequence numbers instead of curText because
    // autospacing after punctuation seems to increment contextSequenceNum
    // without changing curText.
    let lastContextSeqNum = (state.experimentState || {}).contextSequenceNum;
    let lastText = (state.experimentState || {}).curText;
    let lastSuggestionContext = (state.experimentState || {}).suggestionContext;
    let lastVisibleSuggestions = (state.experimentState || {}).visibleSuggestions;

    // Track requests
    if (entry.kind === "meta" && entry.type === "rpc") {
      let msg = _.clone(entry.request.rpc);
      let timestamp = entry.request.timestamp;
      let requestCurText =
        msg.sofar + msg.cur_word.map(ent => ent.letter).join("");
      requestsByTimestamp[timestamp] = { request: msg, response: null };
      if (tmpSugRequests[msg.request_id]) {
        console.assert(
          tmpSugRequests[msg.request_id] === requestCurText,
          `Mismatch request curText for ${participant_id}-${timestamp}}, "${
            tmpSugRequests[msg.request_id]
          }" VS "${requestCurText}"`
        );
        // console.log("Ignoring duplicate request", timestamp);
        requestsByTimestamp[timestamp].dupe = true;
        return;
      } else {
        tmpSugRequests[msg.request_id] = requestCurText;
      }
    } else if (entry.type === "backendReply") {
      let msg = { ...entry.msg, responseTimestamp: entry.jsTimestamp };
      console.assert(requestsByTimestamp[msg.timestamp],
        `No request for timestamp ${msg.timestamp} (have ${Object.keys(requestsByTimestamp)})`);
      requestsByTimestamp[msg.timestamp].response = msg;
    }

    /** STATE UPDATE **/

    if (entry.kind !== "meta") {
      // if (entry.type !== 'backendReply' || isValidSugUpdate)
      let sideEffects = state.handleEvent(entry);
      if (sideEffects) {
        sideEffects.forEach(effect => {
          if (effect.type === 'finalData') {
            finalData = JSON.parse(JSON.stringify(effect.finalData));
          }
        });
      }

      if (entry.type === 'finalData') {
        let loggedFinalData = JSON.parse(JSON.stringify(entry.finalData));
        if (_.isEqual(loggedFinalData.controlledInputs, {})) {
          // Unfortunately some early logs missed this because it was a Mobx map.
          delete loggedFinalData.controlledInputs;
          delete finalData.controlledInputs;
        }
        // Timestamps on the login event are ok to be inconsistent.
        finalData.screenTimes[0].timestamp = loggedFinalData.screenTimes[0].timestamp;
        if (!_.isEqual(loggedFinalData, finalData)) {
          console.log("loggedFinalData", loggedFinalData);
          console.log("finalData", finalData);
          console.assert(false, "finalData mismatch!");
        }
      }
    }

    if (state.screenNum !== lastScreenNum) {
      tmpSugRequests = {};
      lastScreenNum = state.screenNum;
    }

    let expState = state.experimentState;
    if (!expState) {
      return;
    }
    let { curText } = expState;

    let pageData = getPageData();

    if (entry.jsTimestamp) {
      if (pageData.firstEventTimestamp === null) {
        pageData.firstEventTimestamp = entry.jsTimestamp;
      }
      pageData.lastEventTimestamp = entry.jsTimestamp;
    }

    let annotatedAction = {};
    if (!lastText) {
      lastText = "";
    }

    if (
      ["connected", "init", "rpc", "backendReply", "next"].indexOf(
        entry.type
      ) === -1
    ) {
      let { curWord } = lastSuggestionContext;
      let annoType = entry.type;
      if (entry.type === "tapSuggestion") {
        let trimtext = lastText.trim();
        if (trimtext.length === 0 || trimtext.match(/[.?!]$/)) {
          annoType = "tapSugg_bos";
        } else if (curWord.length === 0) {
          annoType = "tapSugg_full";
        } else {
          annoType = "tapSugg_part";
        }
      }
      annotatedAction = {
        ...entry,
        annoType,
        curText: lastText,
        timestamp: entry.jsTimestamp,
        visibleSuggestions: lastVisibleSuggestions,
      };
      if (entry.type === "tapSuggestion" && lastText !== curText) {
        annotatedAction.sugInserted = lastVisibleSuggestions[entry.which][
          entry.slot
        ].words[0].slice(curWord.length);
      }
      if (state.curScreen.screen === "ExperimentScreen")
        pageData.actions.push(annotatedAction);
    }

    let { annotatedFinalText } = pageData;
    if (lastText !== curText) {
      // Update the annotation.
      let commonPrefixLen = Math.max(0, lastText.length - 10);
      while (
        lastText.slice(0, commonPrefixLen) !== curText.slice(0, commonPrefixLen)
      ) {
        commonPrefixLen--;
      }
      while (
        lastText.slice(0, commonPrefixLen + 1) ===
        curText.slice(0, commonPrefixLen + 1)
      ) {
        commonPrefixLen++;
      }
      annotatedFinalText.splice(
        commonPrefixLen,
        lastText.length - commonPrefixLen
      );
      Array.prototype.forEach.call(curText.slice(commonPrefixLen), char => {
        annotatedFinalText.push({ char, action: annotatedAction });
      });
    }

    let curVisibleSuggestions = expState.visibleSuggestions;
    if (expState.contextSequenceNum !== lastContextSeqNum) {
      if (pageData.displayedSuggs[lastContextSeqNum]) {
        pageData.displayedSuggs[lastContextSeqNum].action = entry;
      }
      lastContextSeqNum = expState.contextSequenceNum;
    } else if (entry.type === "backendReply") {
      let hasRecs = !_.isEqual(curVisibleSuggestions.predictions, blankRecs);
      if (expState.lastSuggestionsFromServer.show === false) {
        console.assert(!hasRecs);
      }
      if (expState.flags.hideRecs) {
        hasRecs = false;
      }
      let { request, response } = requestsByTimestamp[entry.msg.timestamp];
      pageData.displayedSuggs[expState.contextSequenceNum] = {
        request_id: request.request_id,
        sofar: request.sofar,
        cur_word: request.cur_word,
        flags: request.flags,
        timestamp: request.timestamp,
        context: expState.curText,
        recs: hasRecs ? curVisibleSuggestions : null,
        latency: response.responseTimestamp - request.timestamp,
        action: null,
      };
    }

    if (
      pageData.displayedSuggs[expState.contextSequenceNum] &&
      !_.isEqual(curVisibleSuggestions, lastDisplayedSuggs)
    ) {
      pageData.displayedSuggs[
        expState.contextSequenceNum
      ].recs = curVisibleSuggestions;
      lastDisplayedSuggs = curVisibleSuggestions;
    }
  });

  // Close out all the experiment pages.
  pageSeq.forEach(pageName => {
    let pageData = byExpPage[pageName];
    let expState = state.experiments.get(pageName);
    pageData.finalText = expState.curText;
    pageData.stimulus = expState.stimulus;
    pageData.flags = expState.flags;
    if (pageData.displayedSuggs[pageData.displayedSuggs.length - 1]) {
      pageData.displayedSuggs[pageData.displayedSuggs.length - 1].action = {
        type: "next",
      };
    }
    pageData.secsOnPage =
      (pageData.lastEventTimestamp - pageData.firstEventTimestamp) / 1000;

    let { annotatedFinalText } = pageData;
    delete pageData["annotatedFinalText"];
    let lastAction = null;
    let chunks = [];
    annotatedFinalText.forEach(({ char, action }) => {
      if (action !== lastAction) {
        chunks.push({
          chars: char,
          action,
          timestamp: action.jsTimestamp,
          actionClass: action.annoType,
        });
        lastAction = action;
      } else {
        chunks[chunks.length - 1].chars += char;
      }
    });
    console.assert(chunks.map(x => x.chars).join("") === pageData.finalText);
    pageData.chunks = chunks;

    // Group chunks into words.
    let words = [{ chunks: [] }];
    chunks.forEach(chunk => {
      words[words.length - 1].chunks.push(chunk);

      let { chars } = chunk;
      let endsWord = chars.match(/[-\s.!?,]/);
      if (endsWord) {
        words.push({ chunks: [] });
      }
    });
    words = words.filter(x => x.chunks.length > 0);
    pageData.words = words;
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
    config: state.masterConfigName,
    isComplete,
    byExpPage,
    pageSeq,
    screenTimes,
    allControlledInputs: state.controlledInputs.toJS(),
  };
}

export function getRev(log) {
  for (let i = 0; i < log.length; i++) {
    let entry = log[i];
    if ("rev" in entry) {
      return entry["rev"];
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
  if ('assignment' in loginEvent) {
    return oldCode.createTaskState(loginEvent);
  } else {
    return oldCode.createTaskState(oldCode.participantId);
  }
}

export async function analyzeLog(log) {
  let state = await getState(log);
  try {
    return processLogGivenState(state, log);
  } catch (e) {
    console.log(e, e.stack);
    throw e;
  }
}
