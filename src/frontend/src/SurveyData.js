import React from "react";

import { likert } from "./SurveyViews";

export const otherMid = {
  text:
    "Any other comments? (There will be more surveys before the end of the experiment.)",
  responseType: "text",
  name: "other",
  flags: { multiline: true },
};

/*
const postTaskBaseQuestions = [
  {
    text:
      "Now that you've had a chance to write about it, how many stars would you give your experience at this restaurant?",
    responseType: "starRating",
    name: "stars",
  },
  {
    text: "How would you describe your thought process while writing?",
    responseType: "text",
    name: "thoughtProcess",
    flags: { multiline: true },
  },
  {
    text:
      "How would you describe the shortcuts that the keyboard gave -- what they were and how you used them (or didn't use them)?",
    responseType: "text",
    name: "shortcuts",
    flags: { multiline: true },
  },

  {
    text:
      "Compared with the experience you were writing about, the shortcuts that the keyboard gave were usually...",
    responseType: "options",
    name: "sentimentManipCheck",
    options: ["More negative", "More positive", "Mixed", "Neutral"],
  },
];
*/

export const tlxQuestions = [
  likert("mental", "How mentally demanding was the task?", 7, [
    "Very low",
    "Very high",
  ]),
  likert("physical", "How physically demanding was the task?", 7, [
    "Very low",
    "Very high",
  ]),
  likert("temporal", "How hurried or rushed was the pace of the task?", 7, [
    "Very low",
    "Very high",
  ]),
  likert(
    "performance",
    "How successful were you in accomplishing what you were asked to do?",
    7,
    ["Perfect \u{1F601}", "Failure \u{1F641}"]
  ),
  likert(
    "effort",
    "How hard did you have to work to accomplish your level of performance?",
    7,
    ["Very low", "Very high"]
  ),
  likert(
    "frustration",
    "How insecure, discouraged, irritated, stressed, and annoyed were you?",
    7,
    ["Very low", "Very high"]
  ),
];

export const personalityHeader = {
  text: (
    <p>
      Describe yourself as you generally are now, not as you wish to be in the
      future. Describe yourself as you honestly see yourself, in relation to
      other people you know of the same sex as you are, and roughly your same
      age. So that you can describe yourself in an honest manner, your responses
      will be kept in absolute confidence.
    </p>
  ),
};

export const traitQuestion = ({item}) => ({
  text: item,
  name: item,
  responseType: "likert",
  options: ["Very Inaccurate", "", "", "", "Very Accurate"],
});

export const verbalized_during = {
  text:
    "While you were writing, did you speak or whisper what you were writing?",
  responseType: "options",
  name: "verbalized_during",
  options: ["Yes", "No"],
};

export const age = {
  text: "How old are you?",
  responseType: "text",
  name: "age",
  flags: { type: "number" },
};

export const gender = {
  text: "What is your gender?",
  responseType: "text",
  name: "gender",
};

export const english_proficiency = {
  text: "How proficient would you say you are in English?",
  responseType: "options",
  name: "english_proficiency",
  options: ["Basic", "Conversational", "Fluent", "Native or bilingual"],
};

export const techDiff = {
  text:
    "Did you experience any technical difficulties that you haven't reported already?",
  responseType: "text",
  name: "techDiff",
  flags: { multiline: true },
};

export const otherFinal = {
  text:
    "Aaaand... we're done! How was this experiment? What went well? What could have been better? Any ideas?",
  responseType: "text",
  name: "other",
  flags: { multiline: true },
};
