/** @format */

import * as React from "react";
import { Editable } from "./Editable";
import { NextBtn } from "./BaseViews";
import { iobs } from "./misc";

const TAB_KEYCODE = 9;

export const WriterView = iobs(({ state, dispatch }) => {
  let { curText, range, caret, suggestions } = state.experimentState;

  const onKeyDown = evt => {
    if (evt.which === TAB_KEYCODE) {
      evt.preventDefault();
      evt.stopPropagation();
      console.log("TAB");
      dispatch({ type: "insertSugWord" });
    }
  };
  let { top, left } = caret || { top: 0, left: 0 };
  return (
    <div>
      <div style={{ position: "relative" }}>
        <Editable
          range={range}
          text={curText}
          onChange={newVals => {
            dispatch({
              type: "setText",
              text: newVals.text,
              range: newVals.range,
              caret: newVals.caret,
            });
            console.log(newVals);
          }}
          onKeyDown={onKeyDown}
        />
        <div
          style={{
            position: "absolute",
            top: top + 20,
            left,
            color: "grey",
          }}
        >
          {suggestions.map((suggestion, idx) => (
            <div key={idx}>{suggestion.text}</div>
          ))}
        </div>
      </div>
      <NextBtn>Submit</NextBtn>
    </div>
  );
});
