/** @format */
import React from "react";
import { observer, inject } from "mobx-react";
import { iobs } from "./misc";

function advance(state, dispatch) {
  dispatch({ type: "next" });
}

export const NextBtn = iobs(props => {
  let enabled;
  if (props.enabledFn) {
    enabled = props.enabledFn(props.state);
  } else {
    enabled = !props.disabled;
  }
  return (
    <button
      className="NextBtn"
      onClick={() => {
        if (!props.confirm || window.confirm("Are you sure?")) {
          advance(props.state, props.dispatch);
        }
      }}
      disabled={!enabled}
    >
      {props.children || (enabled ? "Next" : "Please answer all prompts above")}
    </button>
  );
});
