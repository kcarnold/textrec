import React from "react";
import { ControlledInput, ControlledStarRating } from "./ControlledInputs";
import { observer, inject } from "mobx-react";
import { NextBtn } from "./BaseViews";

export function likert(name, text, degrees, labels) {
  let options = [];
  for (let i = 0; i < degrees; i++) {
    options.push("");
  }
  options[0] = labels[0];
  options[degrees - 1] = labels[1];
  return {
    text,
    name,
    responseType: "likert",
    options,
  };
}

function TextResponse({ basename, question }) {
  return (
    <ControlledInput
      name={`${basename}-${question.name}`}
      {...question.flags || {}}
    />
  );
}

function StarRating({ basename, question }) {
  let { name } = question;
  return <ControlledStarRating name={`${basename}-${name}`} />;
}

export const OptionsResponse = inject("dispatch", "state", "spying")(
  observer(function OptionsResponse({
    state,
    dispatch,
    spying,
    basename,
    question,
  }) {
    let name = `${basename}-${question.name}`;
    let choice = state.controlledInputs.get(name) || "";
    function change(newVal) {
      dispatch({ type: "controlledInputChanged", name, value: newVal });
    }
    return (
      <div>
        {question.options.map(option =>
          <label
            key={option}
            style={{
              background: "#f0f0f0",
              display: "block",
              margin: "3px 0",
              padding: "10px 3px",
              width: "100%",
            }}
            title={spying && `${name}=${option}`}
          >
            <input
              type="radio"
              checked={choice === option}
              onChange={() => change(option)}
            />
            <span style={{ width: "100%" }}>
              {option}
            </span>
          </label>,
        )}
      </div>
    );
  }),
);

export const LikertResponse = inject("dispatch", "state", "spying")(
  observer(function LikertResponse({
    state,
    dispatch,
    spying,
    basename,
    question,
  }) {
    let name = `${basename}-${question.name}`;
    let choice = state.controlledInputs.get(name);
    function change(newVal) {
      dispatch({ type: "controlledInputChanged", name, value: newVal });
    }
    return (
      <div
        style={{ display: "flex", flexFlow: "row nowrap", padding: "5px 0" }}
      >
        {question.options.map((label, idx) =>
          <div key={idx} style={{ textAlign: "center", flex: "1 1 0" }}>
            <label title={spying && `${name}=${idx}`}>
              <input
                type="radio"
                checked={choice === idx}
                onChange={() => change(idx)}
              />
              <br />
              <span>
                {label}&nbsp;
              </span>
            </label>
          </div>,
        )}
      </div>
    );
  }),
);

const responseTypes = {
  starRating: StarRating,
  text: TextResponse,
  options: OptionsResponse,
  likert: LikertResponse,
};

function Question({ basename, question }) {
  let responseType = null;
  if (question.responseType) {
    console.assert(question.responseType in responseTypes);
    responseType = responseTypes[question.responseType];
  }
  return (
    <div
      className="Question"
      style={{
        margin: "5px",
        borderTop: "3px solid #aaa",
        padding: "5px",
      }}
    >
      <div className="QText">
        {question.text}
      </div>
      {responseType &&
        React.createElement(responseType, { basename, question })}
    </div>
  );
}

export const Survey = ({ title, basename, questions }) =>
  <div className="Survey">
    <h1>
      {title}
    </h1>

    {questions.map((question, idx) => {
      return (
        <Question
          key={question.name || idx}
          basename={basename}
          question={question}
        />
      );
    })}

    <NextBtn />
  </div>;
