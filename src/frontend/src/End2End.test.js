global.WebSocket = require('ws');
import * as Dispatcher from "./Dispatcher";
import getApp from "./Apps";
import { autorun } from "mobx";
import forEach from "lodash/forEach";

it("boots", done => {
  let dispatch = Dispatcher.init("test-gcap", "p", loginEvent => {
    console.log(loginEvent);
    let app = getApp(loginEvent.config);
    let state = app.createTaskState(loginEvent);
    autorun((reaction) => {
      reaction.trace();
      console.log('screenNum', state.screenNum);
      if (state.screenNum === null || state.pingTime === null) {
        return; // not yet.
      }
      let { curScreen } = state;
      let screenName = curScreen.screen;
      console.log(screenName);
      if (screenName === "Welcome") {
        dispatch({type: "next"});
      } else if (screenName === "IntroSurvey") {
        dispatch({type: "next"});
      } else if (screenName === "TaskDescription") {
        dispatch({type: "next"});
      } else if (screenName === "StudyDesc") {
        dispatch({type: "next"});
      } else if (screenName === "Instructions") {
        dispatch({type: "next"});
      } else if (screenName === "ExperimentScreen") {
        console.log(state.curExperiment);
        console.log(state.experimentState.contextSequenceNum);
        if (state.experimentState.curText.length > 10) {
          dispatch({type: "next"});
        }
        let {condition} = state.experimentState.flags;
        console.log('condition', condition);

        console.log('curText', state.experimentState.curText);
        if (condition === 'norecs') {
          dispatch({type: "tapKey", key: "x"});
          console.log('new curText', state.experimentState.curText);
        }
      } else {
        done();
      }
    })
    return state;
  }, "ws://localhost:5000");
});

