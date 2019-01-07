/** @format */
import "./style.css";

import React from "react";
import ReactDOM from "react-dom";
import "./index.css";
import * as Dispatcher from "./Dispatcher";
import getApp from "./Apps";

import Raven from "raven-js";
if (process.env.NODE_ENV === "production") {
  Raven.config("https://c0c96b3696f14e4eb2fe4f35f4da3176@sentry.io/186354")
    .config({
      release: process.env.REACT_APP_GIT_REV,
    })
    .install();
}

let elt = document.getElementById("root");
let topLevel = <h3>Invalid URL</h3>;
let query = window.location.search.slice(1);
let initialPart = query.split("/", 1)[0] || query;
let remainder = query.slice(initialPart.length + 1);

if (initialPart === "panopt") {
  let Panopticon = require("./Panopticon").default;
  topLevel = <Panopticon />;
} else if (initialPart === "showall") {
  // e.g., /?showall/c=gcap&a=0
  let mod = require("./ShowAllScreens");
  let match = remainder.match(/^c=(\w+)&a=(\d+)$/);
  let config = match[1];
  let assignment = +match[2];
  let { createTaskState, MasterView } = getApp(config);
  let loginEvent = {
    type: "login",
    participant_id: "zzzzzz",
    config,
    assignment,
  };
  mod.init(createTaskState, MasterView, loginEvent);
  let ShowAllScreens = mod.default;
  topLevel = <ShowAllScreens />;
} else if (query.slice(0, 3) === "new") {
  // e.g., http://localhost:3000/?new&b=gc1
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
  let match = query.match(/^(.+)-(\w+)$/);
  if (match) {
    let clientId = match[1];
    let clientKind = match[2];
    let dispatch = Dispatcher.init(clientId, clientKind, loginEvent => {
      let app = getApp(loginEvent.config);
      let state = app.createTaskState(loginEvent);
      ReactDOM.render(
        <app.MasterView
          state={state}
          dispatch={dispatch}
          clientId={clientId}
          clientKind={"p"}
        />,
        elt
      );
      return state;
    });
    topLevel = <h3>Loading...</h3>;
  }
}

ReactDOM.render(topLevel, elt);
