import React from 'react';

import {likert} from './SurveyViews';

export const miscQuestions = [
  {
    text:
      "Did you experience any technical difficulties that you haven't reported already?",
    responseType: "text",
    name: "techDiff",
    flags: { multiline: true },
  },
  {
    text:
      "Any other comments? (There will be more surveys before the end of the experiment.)",
    responseType: "text",
    name: "other",
    flags: { multiline: true },
  },
];

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
  likert("mental", "Mental Demand: How mentally demanding was the task?", 7, [
    "Very low",
    "Very high",
  ]),
  likert(
    "physical",
    "Physical Demand: How physically demanding was the task?",
    7,
    ["Very low", "Very high"],
  ),
  likert(
    "temporal",
    "Temporal Demand: How hurried or rushed was the pace of the task?",
    7,
    ["Very low", "Very high"],
  ),
  likert(
    "performance",
    "Performance: How successful were you in accomplishing what you were asked to do?",
    7,
    ["Perfect \u{1F601}", "Failure \u{1F641}"],
  ),
  likert(
    "effort",
    "Effort: How hard did you have to work to accomplish your level of performance?",
    7,
    ["Very low", "Very high"],
  ),
  likert(
    "frustration",
    "Frustration: How insecure, discouraged, irritated, stressed, and annoyed were you?",
    7,
    ["Very low", "Very high"],
  ),
];

const traitItems = `
I like to solve complex problems.
I often feel blue.
I feel comfortable around people.
I believe in the importance of art.
I rarely get irritated.
I am not interested in abstract ideas.
I have little to say.
I have difficulty understanding abstract ideas.
I make friends easily.
I need things explained only once.
I have a vivid imagination.
I dislike myself.
I seldom feel blue.
I do not like art.
I keep in the background.
I try to avoid complex people.
I tend to vote for liberal political candidates.
I am skilled in handling social situations.
I can handle a lot of information.
I am often down in the dumps.
I would describe my experiences as somewhat dull.
I avoid difficult reading material.
I avoid philosophical discussions.
I feel comfortable with myself.
I am the life of the party.
I have frequent mood swings.
I love to think up new ways of doing things.
I carry the conversation to a higher level.
I don't like to draw attention to myself.
I avoid philosophical discussions.
I do not enjoy going to art museums.
I am not easily bothered by things.
I know how to captivate people.
I enjoy hearing new ideas.
I am quick to understand things.
I panic easily.
I tend to vote for conservative political candidates.
I am very pleased with myself.
I don't talk a lot.
I love to read challenging material.
`
  .trim()
  .split(/\n/);

export function personalityBlock(blockIdx) {
  const traitsPerBatch = 8;
  let traitBatch = traitItems.slice(
    traitsPerBatch * blockIdx,
    traitsPerBatch * (blockIdx + 1),
  );
  return [
    {
      text: (
        <p>
          <b>Personality</b>
          <br />
          <br />
          Describe yourself as you generally are now, not as you wish to be in
          the future. Describe yourself as you honestly see yourself, in
          relation to other people you know of the same sex as you are, and
          roughly your same age. So that you can describe yourself in an honest
          manner, your responses will be kept in absolute confidence.
        </p>
      ),
    },
    ...traitBatch.map(item => ({
      text: item,
      name: item,
      responseType: "likert",
      options: ["Very Inaccurate", "", "", "", "Very Accurate"],
    })),
    {
      text: "",
    },
  ];
}

export const closingSurveyQuestions = [
  {
    text:
      "While you were writing, did you speak or whisper what you were writing?",
    responseType: "options",
    name: "verbalized_during",
    options: ["Yes", "No"],
  },

  {
    text: <h2>Demographics</h2>,
    responseType: null,
  },

  {
    text: "How old are you?",
    responseType: "text",
    name: "age",
    flags: { type: "number" },
  },

  {
    text: "What is your gender?",
    responseType: "options",
    name: "gender",
    options: ["Male", "Female", "Something else, or I'd prefer not to say"],
  },

  {
    text: "How proficient would you say you are in English?",
    responseType: "options",
    name: "english_proficiency",
    options: ["Basic", "Conversational", "Fluent", "Native or bilingual"],
  },

  // ...personalityBlock(4),

  {
    text:
      "Did you experience any technical difficulties that you haven't reported already?",
    responseType: "text",
    name: "techDiff",
    flags: { multiline: true },
  },
  {
    text: "Aaaand... we're done! How was this experiment? What went well? What could have been better? Any ideas?",
    responseType: "text",
    name: "other",
    flags: { multiline: true },
  },
];
