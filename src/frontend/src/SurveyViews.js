/** @format */

import React from "react";
import { ControlledInput, ControlledStarRating } from "./ControlledInputs";
import { observer, inject } from "mobx-react";
import { NextBtn } from "./BaseViews";
import classNames from "classnames";

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

export const agreeLikert = (name, prompt, n = 7) =>
  likert(name, prompt, n, ["Strongly disagree", "Strongly agree"]);

function TextResponse({ name, question }) {
  return <ControlledInput name={name} {...question.flags || {}} />;
}

function StarRating({ name }) {
  return <ControlledStarRating name={name} />;
}

export const OptionsResponse = inject("dispatch", "state", "spying")(
  observer(function OptionsResponse({
    state,
    dispatch,
    spying,
    name,
    question,
  }) {
    let choice = state.controlledInputs.get(name) || "";
    let options = question.options.map(option =>
      typeof option === "string" ? { key: option, value: option } : option
    );
    function change(newVal) {
      dispatch({ type: "controlledInputChanged", name, value: newVal });
    }
    return (
      <div>
        {options.map(({ key, value }) => (
          <label
            key={key}
            style={{
              background: "#f0f0f0",
              display: "block",
              margin: "3px 0",
              padding: "10px 3px",
              width: "100%",
            }}
            title={spying ? `${name}=${key}` : undefined}
          >
            <input
              type="radio"
              checked={choice === key}
              onChange={() => change(key)}
            />
            <span style={{ width: "100%" }}>{value}</span>
          </label>
        ))}
      </div>
    );
  })
);

export const LikertResponse = inject("dispatch", "state", "spying")(
  observer(function LikertResponse({
    state,
    dispatch,
    spying,
    name,
    question,
  }) {
    let choice = state.controlledInputs.get(name);
    function change(newVal) {
      dispatch({ type: "controlledInputChanged", name, value: newVal });
    }
    return (
      <div
        style={{ display: "flex", flexFlow: "row nowrap", padding: "5px 0" }}
      >
        {question.options.map((label, idx) => (
          <label
            key={idx}
            style={{ display: "block", textAlign: "center", flex: "1 1 0px" }}
            title={spying ? `${name}=${idx}` : undefined}
          >
            <input
              type="radio"
              checked={choice === idx}
              onChange={() => change(idx)}
            />
            <br />
            <span>
              {label}
              &nbsp;
            </span>
          </label>
        ))}
      </div>
    );
  })
);

const responseTypes = {
  starRating: StarRating,
  text: TextResponse,
  options: OptionsResponse,
  likert: LikertResponse,
};

const allQuestions = {};

export const ColumnDictionary = inject("state")(() => (
  <div style={{ fontSize: "10px" }}>
    {Array.from(Object.entries(allQuestions)).length} survey questions:
    <table>
      <thead>
        <tr>
          <td>Column</td>
          <td>Type</td>
          <td>Options</td>
          <td>Text</td>
        </tr>
      </thead>
      <tbody>
        {Array.from(Object.entries(allQuestions)).map(
          ([responseVarName, question]) => (
            <tr key={responseVarName}>
              <td>{responseVarName}</td>
              <td>{question.responseType}</td>
              <td>{(question.options || []).join(", ")}</td>
              <td>{question.text}</td>
            </tr>
          )
        )}
      </tbody>
    </table>
  </div>
));

const Question = inject("state")(
  observer(({ basename, question, state }) => {
    let responseType = null;
    let responseVarName = null;
    let responseClass = null;
    if (question.responseType) {
      console.assert(question.responseType in responseTypes);
      responseType = responseTypes[question.responseType];
      responseVarName = `${basename}-${question.name}`;
      responseClass =
        state.controlledInputs.get(responseVarName) !== undefined
          ? "complete"
          : "missing";
      allQuestions[responseVarName] = question;
    } else {
      console.assert(!!question.text);
    }
    return (
      <div
        className={classNames("Question", responseClass)}
        style={{
          margin: "5px",
          borderTop: "1px solid #aaa",
          padding: "5px",
        }}
      >
        <div className="QText">{question.text}</div>
        {responseType &&
          React.createElement(responseType, {
            question,
            name: responseVarName,
          })}
      </div>
    );
  })
);

export const surveyBody = (basename, questions) =>
  questions.map((question, idx) => {
    return (
      <Question
        key={question.name || idx}
        basename={basename}
        question={question}
      />
    );
  });

export const allQuestionsAnswered = (basename, questions) => state =>
  questions.every(
    question =>
      question.type === "text" ||
      !question.responseType ||
      question.optional ||
      state.controlledInputs.get(basename + "-" + question.name) !== undefined
  );

export const Survey = ({ title, basename, questions }) => (
  <div className="Survey">
    <h1>{title}</h1>

    {surveyBody(basename, questions)}

    <NextBtn enabledFn={allQuestionsAnswered(basename, questions)} />
  </div>
);

export function surveyView(props) {
  return () => React.createElement(Survey, props);
}
