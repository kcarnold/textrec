/** @format */
import "./style.css";

import React from "react";
import ReactDOM from "react-dom";
import "./index.css";
import * as Dispatcher from "./Dispatcher";
import getApp from "./Apps";

import Raven from "raven-js";

// Configure error logging.
if (process.env.NODE_ENV === "production") {
  Raven.config("https://c0c96b3696f14e4eb2fe4f35f4da3176@sentry.io/186354")
    .config({
      release: process.env.REACT_APP_GIT_REV,
    })
    .install();
}

let elt = document.getElementById("root");
let topLevel = <h3>Invalid URL</h3>;

// Parse URL into an initial part and remainder. e.g.,
// /?showall/c=cue&a=0&prompt=restaurant
// gets split into "showall" and "c=cue..."
let query = window.location.search.slice(1);
let initialPart = query.split("/", 1)[0] || query;
let remainder = query.slice(initialPart.length + 1);

const handlers = {
  panopt() {
    let Panopticon = require("./Panopticon").default;
    topLevel = <Panopticon />;
  },

  showall() {
    // e.g., /?showall/c=gcap&a=0
    let mod = require("./ShowAllScreens");
    let loginEvent = {
      type: "login",
      participant_id: "zzzzzz",
    };
    remainder.split("&").forEach(part => {
      let [k, v] = part.split("=", 2);
      if (k === "c") k = "config";
      else if (k === "a") k = "assignment";
      loginEvent[k] = v;
    });
    let { createTaskState, MasterView } = getApp(loginEvent.config);
    mod.init(createTaskState, MasterView, loginEvent);
    let ShowAllScreens = mod.default;
    topLevel = <ShowAllScreens />;
  },

  new: () => {
    // e.g., http://localhost:3000/?new/b=gc1
    let params = remainder.split("&").map(x => x.split("="));
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
  },

  showrecs() {
    let ShowRecs = require("./ShowRecs").default;
    topLevel = <ShowRecs />;
  },

  idx() {
    let tasks = ["reviewRestaurant", "wiki-book", "wiki-film", "travelGuide"];

    topLevel = (
      <ul>
        {[
          "showall/c=idea&a=0",
          "panopt/XX",
          ...tasks.map(prompt => `demoidea-cueSents-${prompt}-p`),
          ...tasks.map(prompt => `demoidea-randomSents-${prompt}-p`),
          ...tasks.map(prompt => `demoidea-cueWords-${prompt}-p`),
          ...tasks.map(prompt => `demoidea-highlightedSents-${prompt}-p`),
        ].map((u, i) => (
          <li key={i}>
            <a href={"/?" + u}>{u}</a>
          </li>
        ))}
      </ul>
    );
  },
};

// Dispatch by initial part
if (handlers[initialPart]) {
  handlers[initialPart]();
} else {
  // Otherwise, this is a participant view, of the form "xxxxxx-p"
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
          clientKind={clientKind}
        />,
        elt
      );
      return state;
    });
    topLevel = <h3>Loading...</h3>;
  }
}

ReactDOM.render(topLevel, elt);
