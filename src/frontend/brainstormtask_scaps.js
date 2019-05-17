
const selfEfficacyQuestions = writingType => [
  SurveyData.selfEfficacy(
    "recognizing",
    <span>
      <b>recognizing</b> good {writingType.plural}
    </span>
  ),
  SurveyData.selfEfficacy(
    "writing",
    <span>
      <b>writing</b> good {writingType.plural}
    </span>
  ),
];

const experienceAndSelfEfficacyQuestions = writingType => [
  SurveyData.numericResponse({
    name: "howManyReviewsWritten",
    text: `About how many ${
      writingType.plural
    } have you written in the past 3 months?`,
  }),
  ...selfEfficacyQuestions(writingType),
];

const introSurvey = writingType => ({
  screen: "IntroSurvey",
  view: surveyView({
    title: "Opening Survey",
    basename: "intro",
    questions: [
      {
        type: "text",
        text: (
          <p>
            You'll be writing {writingType.singular}. We'll walk you through the
            process; <b>do all your work within this window</b>. First, though a
            few background questions:
          </p>
        ),
      },
      ...experienceAndSelfEfficacyQuestions(writingType),
    ],
  }),
});

const instructions = header => ({
  screen: "Instructions",
  view: () => (
    <div className="Survey">
      {header}
      <p>Click "Start" to begin.</p>
      <NextBtn>Start</NextBtn>
    </div>
  ),
});

const closingSurvey = writingType => ({
  screen: "PostExpSurvey",
  view: surveyView({
    title: "Closing Survey",
    basename: "postExp",
    questions: [
      // likert("fluency", "How fluent did you feel ")
      ...selfEfficacyQuestions(writingType),
      // SurveyData.verbalized_during,

      // Not going to use demographic survey for the pilot, no need for that data.
      // ...demographicsSurvey,

      {
        type: "options",
        responseType: "options",
        text: (
          <span>
            Is there any reason that we shouldn't use your data? If so, please
            explain in the next question.{" "}
            <b>There's no penalty for answering "don't use" here.</b>
          </span>
        ),
        options: ["Use my data", "Don't use my data"],
        name: "shouldExclude",
      },
      SurveyData.otherFinal,
    ],
  }),
});



const TASKS = {
  restaurant: {
    prewriteMinutes: 4,
    finalMinutes: 4,

    flags: { domain: "restaurant" },

    writingType: {
      singular: "a restaurant review",
      plural: "restaurant reviews",
    },

    // FIXME: this reuses the value of "minutes".
    prewriteHeader: (
      <ReviewHeaderPrewrite controlledInputName="thingName" minutes={4} />
    ),
    finalHeader: (
      <ReviewHeaderFinal controlledInputName="thingName" minutes={4} />
    ),
  },

  movie: {
    prewriteMinutes: 4,
    finalMinutes: 4,
    precommitScreen: precommitScreen(
      <span>
        Think of a movie or TV show that you've seen recently that you{" "}
        <b>haven't written about before</b>.
      </span>
    ),
    flags: { domain: "movie" },

    writingType: {
      singular: "a movie review",
      plural: "movie reviews",
    },

    prewriteHeader: (
      <ReviewHeaderPrewrite controlledInputName="thingName" minutes={4} />
    ),
    finalHeader: (
      <ReviewHeaderFinal controlledInputName="thingName" minutes={4} />
    ),
  },

  bio: {
    prewriteMinutes: 4,
    finalMinutes: 4,
    precommitScreen: null,
    writingType: {
      singular: "a bio",
      plural: "bios",
    },
    prewriteHeader: (
      <div>
        <h1>Pre-writing for your bio</h1>
        <p>
          Before we write the bio, we're going to do a little pre-writing
          exercise.
        </p>
        <blockquote>
          Imagine someone is interviewing you about yourself.{" "}
          <b>What relevant questions could they ask you?</b> Think of as many as
          you can in {4} minutes.
        </blockquote>
      </div>
    ),
    flags: { domain: "bio" },
  },
};

const highlightedSpan = (text, highlight) => {
  if (!highlight) return <span>{text}</span>;
  let [a, b] = highlight;
  return (
    <span>
      {text.slice(0, a)}
      <b>{text.slice(a, b)}</b>
      {text.slice(b)}
    </span>
  );
};

function surveyView(props) {
  return () => React.createElement(Survey, props);
}

const demographicsSurvey = [
  SurveyData.age,
  SurveyData.gender,
  SurveyData.english_proficiency,
  SurveyData.techDiff,
];



const ReviewHeaderFinal = iobs(({ controlledInputName, state, minutes }) => (
  <div>
    <h1>
      Your review of <i>{state.controlledInputs.get(controlledInputName)}</i>
    </h1>
    <p>Now, write an informative review.</p>
  </div>
));