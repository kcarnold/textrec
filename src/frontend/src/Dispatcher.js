import fromPairs from "lodash/fromPairs";
import map from "lodash/map";
import throttle from "lodash/throttle";
import * as M from "mobx";
import WSClient from "./wsclient";
import Raven from "raven-js";
import * as WSPinger from "./WSPinger";
import { MAX_PING_TIME } from './misc';

export function init(clientId, clientKind, onConnected, wsURL) {
  // onConnected is called when connected, with the login event. Returns the state object.

  let state = null;

  if (wsURL === undefined) {
    wsURL = `ws://${window.location.host}`;
  }
  var ws = new WSClient(wsURL + "/ws");

  var messageCount = {};
  window.messageCount = messageCount;

  var browserMeta = {
    userAgent: navigator.userAgent,
    screen: fromPairs(
      map("height availHeight width availWidth".split(" "), x => [
        x,
        window.screen[x],
      ])
    ),
    window: {
      devicePixelRatio: window.devicePixelRatio,
    },
    documentElement: {
      clientHeight: document.documentElement.clientHeight,
      clientWidth: document.documentElement.clientWidth,
    },
  };

  function updateBacklog() {
    ws.setHello([
      {
        type: "init",
        participantId: clientId,
        kind: clientKind,
        browserMeta,
        git_rev: process.env.REACT_APP_GIT_REV,
        messageCount: messageCount,
      },
    ]);
  }

  function addLogEntry(kind, event) {
    if (!messageCount[kind]) messageCount[kind] = 0;
    messageCount[kind] += 1;
    updateBacklog();
  }

  if (clientId) {
    updateBacklog();
    ws.connect();
  }

  var eventHandlers = [];

  function registerHandler(fn) {
    eventHandlers.push(fn);
  }

  function handleSideEffect(sideEffect) {
    if (sideEffect.type === "rpc") {
      console.log(sideEffect);
      ws.send(sideEffect);
    } else {
      setTimeout(() => dispatch(sideEffect), 0);
    }
  }

  function handleEventWithSideEffects(event) {
    let sideEffects = [];
    eventHandlers.forEach(fn => {
      let res = fn(event);
      if (res.length) {
        sideEffects = sideEffects.concat(res);
      }
    });
    // Run side-effects after all handlers have had at it.
    sideEffects.forEach(handleSideEffect);
  }

  function _dispatch(event) {
    Raven.captureBreadcrumb({
      category: "dispatch",
      message: event.type,
      data: event,
    });
    console.log(event);
    event.jsTimestamp = +new Date();
    event.kind = clientKind;
    event.seq = (messageCount[clientKind] || 0);
    log(event);
    handleEventWithSideEffects(event);
  }

  let dispatch;
  if (process.env.NODE_ENV === "production") {
    dispatch = event => {
      try {
        return _dispatch(event);
      } catch (e) {
        Raven.captureException(e, {
          tags: { dispatcher: "dispatch" },
          extra: event,
        });
        throw e;
      }
    };
  } else {
    dispatch = _dispatch;
  }

  // Every event gets logged to the server. Keep events small!
  function log(event) {
    ws.send({ type: "log", event });
    addLogEntry(clientKind, event);
  }


  ws.onmessage = function(msg) {
    if (msg.type === "reply") {
      dispatch({ type: "backendReply", msg });
    } else if (msg.type === "backlog") {
      let backlogEvents = msg.body;
      console.log("Backlog", backlogEvents.length);
      if (state === null) {
        let loginEvent = backlogEvents[0];
        state = onConnected(loginEvent);
        window.state = state;
        registerHandler(state.handleEvent);
        afterFirstMessage();
      }

      state.replaying = true;
      let sideEffects = [];
      backlogEvents.forEach(msg => {
        try {
          sideEffects = state.handleEvent(msg);
          addLogEntry(msg.kind, msg);
        } catch (e) {
          Raven.captureException(e, {
            tags: { dispatcher: "backlog" },
            extra: msg,
          });
          throw e;
        }
      });
      state.replaying = false;

      // Run the side-effects of the last event.
      // For example, if the last event resulted in a server request,
      // but the network failed before the server response was received,
      // then this will cause the side-effect to happen again.
      //
      // I'm a bit nervous about this since we didn't use it earlier, and
      // I'm really only adding it to make demo init work again.
      // But side-effects are pretty innoculous -- RPC requests (which could mess with
      // suggestion request sync) and rarely other things.
      sideEffects.forEach(handleSideEffect);

      updateBacklog();

    } else if (msg.type === "otherEvent") {
      console.log("otherEvent", msg.event);
      // Keep all the clients in lock-step.
      state.handleEvent(msg.event);
      addLogEntry(msg.event.kind, msg.event);
    }
  };

  // The handler for the first backlog message calls 'afterFirstMessage'.
  function afterFirstMessage() {
    if (clientKind === "p") {
      setSizeDebounced();
      window.addEventListener("resize", setSizeDebounced);
    }
    if (state.pingTime === null || state.pingTime > MAX_PING_TIME) {
      setTimeout(
        () =>
          WSPinger.doPing(wsURL + "/ping", 5, function(ping) {
            dispatch({ type: "pingResults", ping });
          }),
        100
      );
    }
  }

  function setSize() {
    let width = Math.min(
      document.documentElement.clientWidth,
      window.screen.availWidth
    );
    let height = Math.min(
      document.documentElement.clientHeight,
      window.screen.availHeight
    );
    dispatch({ type: "resized", width, height });
  }

  var setSizeDebounced = throttle(setSize, 100, {
    leading: false,
    trailing: true,
  });

  // Globals
  window.M = M;
  window.dispatch = dispatch;

  return dispatch;
}
