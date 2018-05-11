import React from "react";
import ReactDOM from "react-dom";
import "./index.css";
import * as Wrapper from "./Wrapper";
import getApp from "./Apps";

import Raven from "raven-js";
if (process.env.NODE_ENV === "production") {
  Raven.config("https://c0c96b3696f14e4eb2fe4f35f4da3176@sentry.io/186354")
    .config({
      release: process.env.REACT_APP_GIT_REV,
    })
    .install();
}

let topLevel = <h3>Invalid URL</h3>;
let query = window.location.search.slice(1);
let initialPart = query.split("/", 1)[0] || query;

if (initialPart === "panopt") {
  let Panopticon = require("./Panopticon").default;
  topLevel = <Panopticon />;
} else if (initialPart === "showall") {
  let mod = require("./ShowAllScreens");
  let { createTaskState, screenToView } = getApp("cap");
  mod.init(createTaskState, screenToView, query.slice(initialPart.length + 1));
  let ShowAllScreens = mod.default;
  topLevel = <ShowAllScreens />;
} else if (initialPart === "bench") {
  let Bench = require("./Bench").default;
  topLevel = <Bench />;
// } else if (initialPart === "demos") {
//   let DemoList = require("./DemoList").default;
//   topLevel = <DemoList />;
} else if (query.slice(0, 3) === "new") {
  let params = query
    .split("&")
    .slice(1)
    .map(x => x.split("="));
  topLevel = <div>Logging in...</div>;
  let xhr = new XMLHttpRequest();
  xhr.open("POST", "/login", true);
  xhr.setRequestHeader("Accept", "application/json");
  xhr.setRequestHeader("Content-Type", "application/json;charset=UTF-8");
  xhr.onreadystatechange = function() {
    if (xhr.readyState === XMLHttpRequest.DONE) {
      console.log("response", xhr.responseText);
      let { participant_id } = JSON.parse(xhr.responseText);
      window.location.replace(
        `${window.location.protocol}//${
          window.location.host
        }/?${participant_id}-p`
      );
    }
  };
  xhr.send(JSON.stringify({ params, jsTimestamp: +new Date() }));
} else {
  let match = query.match(/^(\w+-)?(\w+)-(\w+)$/);
  if (match) {
    let appName;
    if (match[1]) {
      appName = match[1].slice(0, -1);
    } else {
      appName = 'cap';
    }
    let clientId = match[2];
    let clientKind = match[3];
    let app = getApp(appName);
    if (app != null) {
      let { createTaskState, screenToView } = app;
      let MasterViewFactory = require("./MasterView").default;
      let MasterView = MasterViewFactory(screenToView);
      let state = createTaskState(clientId || "");
      let globalState = Wrapper.init(state, clientId, clientKind);
      topLevel = (
        <Wrapper.View global={globalState}>
          <MasterView kind={clientKind} />
        </Wrapper.View>
      );
    }
  }
}

ReactDOM.render(topLevel, document.getElementById("root"));
