/** @format */

import React, { Component } from "react";
import { decorate, observable, action, toJS } from "mobx";
import { parse, differenceInMinutes, format } from "date-fns";
import { observer } from "mobx-react";
import WSClient from "./wsclient";
import map from "lodash/map";
import filter from "lodash/filter";
import { getOldCode } from "./Analyzer";

function commonPrefixLength(x, y) {
  // Get longest common prefix between x and y.
  let prefixLength = 0;
  let maxLen = Math.min(x.length, y.length);
  while (prefixLength < maxLen) {
    if (x[prefixLength] === y[prefixLength]) {
      prefixLength++;
    } else {
      break;
    }
  }
  return prefixLength;
}

let match = window.location.search.slice(1).match(/^(\w+)\/(\w+)$/);
let panopt = match[1],
  panopticode = match[2];

const SHOW_REPLAY = true;

var ws = new WSClient(`ws://${window.location.host}/ws`);
ws.setHello([{ type: "init", participantId: panopticode, kind: panopt }]);
ws.connect();

// Logs are not observable, for minimal overhead.
// var logs = {};
var oldCodes = {};
var masterViews = {};

class PanoptStore {
  showingIds = [];
  acceleration = 10;

  states = observable.map({}, { deep: false });
  startTimes = observable.map({}, { deep: false });
  times = observable.map({}, { deep: false });
  analyses = observable.map({}, { deep: false });
  textHistories = observable.map({}, { deep: true });

  addViewer(id) {
    if (this.showingIds.indexOf(id) !== -1) return; // Already a viewer.
    this.showingIds.push(id);
    if (SHOW_REPLAY) {
      ws.send({ type: "get_logs", participantId: id });
    }
    ws.send({ type: "get_analyzed", participantId: id });
  }

  addViewers(ids) {
    ids.split(/\s/).forEach(id => this.addViewer(id));
  }
}
decorate(PanoptStore, {
  showingIds: observable,
  addViewer: action,
  addViewers: action,
});

var store = new PanoptStore();

function replay(log, state) {
  if (log.length === 0) return;
  let idx = 0;
  function tick() {
    let event = log[idx];
    let toLog = { ...event };
    delete toLog.participant_id;
    delete toLog.timestamp;
    delete toLog.kind;
    delete toLog.jsTimestamp;
    let textHistory = store.textHistories.get(event.participant_id);

    state.handleEvent(event);

    let curText = (state.experimentState || {}).curText;
    let lastText =
      textHistory.length > 0 ? textHistory[textHistory.length - 1] : {};
    if (curText !== lastText.text) {
      textHistory.push({ timestamp: event.jsTimestamp, text: curText });
    }

    if (idx === log.length - 1) return;
    setTimeout(
      tick,
      0
      // Math.min(
      //   1000,
      //   (log[idx + 1].jsTimestamp - log[idx].jsTimestamp) / store.acceleration
      // )
    );
    idx++;
  }
  tick();
}

ws.onmessage = async function(msg) {
  if (msg.type === "logs") {
    let { participant_id, logs } = msg;
    // logs[participant_id] = msg.logs;
    oldCodes[participant_id] = await getOldCode(logs);
    let { createTaskState, MasterView } = oldCodes[participant_id];
    let loginEvent = logs[0];
    let state = createTaskState(loginEvent);
    masterViews[participant_id] = MasterView;
    store.states.set(participant_id, state);
    store.textHistories.set(participant_id, []);
    replay(msg.logs, state);
    state.replaying = false;
    // store.startTimes.set(participantId, msg.logs[0].jsTimestamp);
    // state.replaying = true;
    // logs[participantId].forEach(msg => {
    //   state.handleEvent(msg);
    // });
    // state.replaying = false;
  }
  if (msg.type === "analyzed") {
    store.analyses.set(msg.participant_id, msg.analysis);
  }
};

const nullDispatch = () => {};

const ScreenTimesTable = ({ screenTimes }) => {
  let lastTime = null;
  let durs = [];
  screenTimes.forEach(({ timestamp }) => {
    let curTime = parse(timestamp);
    if (lastTime !== null) {
      durs.push(differenceInMinutes(curTime, lastTime));
    }
    lastTime = curTime;
  });
  return (
    <table>
      <tbody>
        {screenTimes.map(({ name, num, timestamp }, i) => {
          let curTime = parse(timestamp);
          let dur =
            i < durs.length ? `${Math.round(10 * durs[i]) / 10} min` : null;
          return (
            <tr key={num}>
              <td>{name}</td>
              <td>{format(curTime, "HH:mm:ss")}</td>
              <td>{dur}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
};

const ShowRecs = ({ recs, action }) => (
  <div style={{ display: "flex", flexFlow: "column nowrap" }}>
    <div
      style={{
        display: "flex",
        flexFlow: "row nowrap",
        justifyContent: "space-between",
      }}
    >
      {recs.synonyms.map(({ words }, i) => (
        <div
          key={i}
          style={{
            padding: "5px",
            fontWeight: action.slot === i ? "bold" : null,
          }}
        >
          {words.join(" ")}
        </div>
      ))}
    </div>
  </div>
);

function getStyle(chunk) {
  let { actionClass, action, chars } = chunk;
  let { sugInserted } = action;
  if (actionClass === "tapKey") return {};
  let style = {};
  // let curWord = (action.curText.match(/\w+$/) || [''])[0];
  // console.assert(actionClass.match(/^tapSugg/));
  if (sugInserted !== chars.trim()) {
    style["background"] = "red";
    console.log(
      'mismatch "%s" vs "%s", context "%s" sug "%s"',
      sugInserted,
      chars,
      action.curText.slice(-15),
      action.visibleSuggestions[action.which]
    );
  } else if (actionClass === "tapSugg_part") {
    style["outline"] = "1px solid red";
  } else {
    style["background"] = "green";
  }
  return style;
}

const Chunk = ({ chunk }) => <span style={getStyle(chunk)}>{chunk.chars}</span>;

const AnnotatedFinalText = ({ chunks }) => (
  <div className="AnnotatedFinalText">
    {chunks.map((chunk, i) => (
      <Chunk key={i} chunk={chunk} />
    ))}
  </div>
);

const TextHistoryView = observer(({ history }) => {
  if (history.length === 0) return <div />;
  let lastEntry = history[0];
  let firstTimestamp = history[0].timestamp;
  return (
    <div
      style={{
        position: "relative",
        height: "500px",
        overflow: "scroll",
        whiteSpace: "nowrap",
      }}
    >
      {history.map((entry, i) => {
        let preLen = 0;
        if (i > 0) {
          let lastText = lastEntry.text;
          preLen = commonPrefixLength(lastText, entry.text);
        }
        lastEntry = entry;
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              top: (entry.timestamp - firstTimestamp) / 1000,
            }}
          >
            <span style={{ opacity: 0.01 }}>{entry.text.slice(0, preLen)}</span>
            {entry.text.slice(preLen)}
          </div>
        );
      })}
    </div>
  );
});

const AnalyzedView = observer(({ store, participantId }) => {
  let analysis = store.analyses.get(participantId);
  if (!analysis) return null;
  return (
    <div>
      <ScreenTimesTable screenTimes={analysis.screenTimes} />
      <table style={{ fontSize: "10px" }}>
        <tbody>
          {analysis.allControlledInputs.map(([k, v]) => (
            <tr key={k}>
              <td>{k}</td>
              <td>{v}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
});

const ReplayView = observer(({ store, participantId }) => {
  let state = store.states.get(participantId);
  if (!state) return null;
  let MasterView = masterViews[participantId];
  if (!MasterView) return null;
  return (
    <div style={{ display: "flex", flexFlow: "row" }}>
      <div
        style={{
          overflow: "scroll",
          width: state.phoneSize.width,
          height: state.phoneSize.height,
          border: "1px solid black",
          flex: "0 0 auto",
        }}
      >
        <MasterView
          state={state}
          dispatch={nullDispatch}
          clientId={participantId}
          clientKind={"p"}
          spying={true}
        />
      </div>
      <div style={{ flex: "1 1 auto" }}>
        {/*state.experiments.entries().map(([name, expState]) => (
          <div key={name}>
            <b>{name}</b>
            <br />
            {expState.curText}
          </div>
        ))*/}
      </div>
    </div>
  );
});

const Panopticon = observer(
  class Panopticon extends Component {
    render() {
      return (
        <div>
          <div>
            <input
              ref={elt => {
                this.viewerInput = elt;
              }}
            />
            <button
              onClick={evt => {
                store.addViewers(this.viewerInput.value);
                this.viewerInput.value = "";
              }}
            >
              Add
            </button>
          </div>
          {store.showingIds.map(participantId => {
            let conditions = [];
            // let state = store.states.get(participantId);
            // if (!state.masterConfig) return null;
            return (
              <div key={participantId}>
                <h1>
                  {participantId} {conditions.join(",")}
                </h1>
                <TextHistoryView
                  history={store.textHistories.get(participantId) || []}
                />
                <AnalyzedView store={store} participantId={participantId} />
                {false && (
                  <ReplayView store={store} participantId={participantId} />
                )}
              </div>
            );
          })}
        </div>
      );
    }
  }
);

export default Panopticon;

// Globals
window.toJS = toJS;
window.store = store;

store.addViewers("269xh7 9rq5rw pvqf36 3rh4cc crqp24 87f3mv");
