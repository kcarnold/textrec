/**
 * @format
 */

import * as React from "react";
import { observer } from "mobx-react";

import flatMap from "lodash/flatMap";

import { createState } from "./MasterState";
import { TrialState } from "./BrainstormTrialState";
import * as Views from "./CueViews";
import { Editable } from "./Editable";
import { NextBtn } from "./BaseViews";
import { likert, agreeLikert, surveyBody, surveyView } from "./SurveyViews";
import * as SurveyData from "./SurveyData";
import {
  ControlledInput,
  ControlledStarRating,
  ControlledInputView,
  withValidation,
} from "./ControlledInputs";

import { finalDataLogger, iobs } from "./misc";
import * as shuffle from "./shuffle";

const namedConditions = {
  norecs: { recType: null },
  practice: { recType: "practice" },
  randomSents: { recType: "randomSents", n_cues: 10 },
  cueSents: { recType: "cueSents", n_cues: 10 },
  cueWords: { recType: "cueWords", n_cues: 10 },
  highlightedSents: { recType: "highlightedSents", n_cues: 10 },
  randomWords: { recType: "randomWords", n_cues: 10 },
};

let baseConditions = ["norecs", "randomSents", "highlightedSents"];

const WelcomeScreen = { screen: "Welcome", view: Views.Welcome };
const DoneScreen = { screen: "Done", view: Views.Done };

const highlightedSpan = (text, highlight) => {
  if (!highlight) return <span>{text}</span>;
  let [a, b] = highlight;
  const deEmph = x => <span style={{ color: "#888" }}>{x}</span>;

  return (
    <span>
      {deEmph(text.slice(0, a))}
      <b>{text.slice(a, b)}</b>
      {deEmph(text.slice(b))}
    </span>
  );
};

const InspirationBox = iobs(({ state, dispatch, ideaSource }) => (
  <div
    style={{
      padding: "5px",
      margin: "10px",
      border: "1px solid #ccc",
      borderRadius: "5px",
      width: "350px",
    }}
  >
    <h2 style={{ paddingTop: "0", marginTop: "0" }}>For inspiration...</h2>
    <button
      onClick={e => dispatch({ type: "inspireMe" })}
      style={{
        fontSize: "16px",
        background: "green",
        color: "white",
        padding: "10px",
        borderRadius: "10px",
      }}
    >
      <img
        src="/static/capicon-refresh.png"
        alt=""
        style={{ width: "25px", paddingRight: "5px" }}
      />
      Get fresh inspirations!
    </button>
    <br />
    {state.experimentState.suggestions.length > 0 ? (
      <div>
        <ul>
          {state.experimentState.suggestions.map((s, idx) => (
            <li key={idx} style={{ marginBottom: "5px", fontSize: "85%" }}>
              {highlightedSpan(s.text, s.highlightSpan)}
            </li>
          ))}
        </ul>
        <p style={{ fontSize: "8pt" }}>Source: {ideaSource}</p>
      </div>
    ) : state.experimentState.numInspirationRequests > 0 ? (
      <div>Sorry, inspirations are not available this time.</div>
    ) : (
      <div style={{ color: "#777" }}>
        Click the button to get the first inspirations
      </div>
    )}
  </div>
));

// Hacky: this needs to be an observer because userIdeas is an observable...
const IdeaList = observer(({ userIdeas, addIdea, placeholder }) => {
  let newIdeaEntry = React.createRef();
  if (!placeholder) placeholder = "Is this a question?";
  function _addIdea() {
    let text = newIdeaEntry.current.value.trim();
    if (text.length > 0) {
      addIdea(text);
      newIdeaEntry.current.value = "";
    }
  }

  function onKey(evt) {
    if (evt.key === "Enter") {
      _addIdea();
    }
  }

  return (
    <div>
      <ol>
        {userIdeas.map((idea, idx) => (
          <li key={idx}>{idea}</li>
        ))}
        {addIdea && (
          <li>
            <input
              style={{ width: "250px" }}
              type="text"
              ref={newIdeaEntry}
              onKeyPress={onKey}
              placeholder={placeholder}
            />{" "}
            <span style={{ color: "#777" }}>Press Enter to add</span>
          </li>
        )}
      </ol>
    </div>
  );
});

const SmartIdeaList = iobs(
  ({ state, dispatch, fixed, placeholder, validation }) => {
    function addIdea(idea) {
      idea = idea.trim();
      if (validation) {
        let validationErr = validation(idea);
        if (validationErr) {
          alert(validationErr);
          return;
        }
      }
      dispatch({ type: "addIdea", idea });
    }
    return (
      <IdeaList
        userIdeas={state.experimentState.ideas}
        addIdea={fixed ? null : addIdea}
        placeholder={placeholder}
      />
    );
  }
);

const WritingView = iobs(({ state, dispatch }) => (
  <Editable
    text={state.experimentState.curText}
    onChange={newVals => {
      dispatch({ type: "setText", text: newVals.text });
    }}
  />
));

function getScreens(prompts, conditionNames, isDemo) {
  let tasksAndConditions = prompts.map((conditionName, idx) => ({
    conditionName: conditionNames[idx],
    prompt: prompts[idx],
    task: getTask(prompts[idx]),
  }));
  if (isDemo) return getPrewritingScreens(tasksAndConditions);
  return [
    WelcomeScreen,
    // getIntroSurvey(tasksAndConditions),
    getPrecommitScreen(tasksAndConditions),
    ...getPracticeScreens(),
    ...getPrewritingScreens(tasksAndConditions),
    {
      screen: "MidwaySurvey",
      view: surveyView({
        title: "A quick break",
        basename: "mid",
        questions: [
          {
            type: "text",
            text:
              "We're going to actually write those short articles in a moment. Don't worry, since you already did some work, the rest will be easier. But first, a few questions for a quick break:",
          },
          ...SurveyData.shortNFC,
          {
            type: "text",
            text: "",
          },
          ...flatMap(tasksAndConditions, ({ prompt, task }, idx) =>
            selfEfficacyQuestions(idx, task.topicName)
          ),
        ],
      }),
    },
    ...getFinalWritingScreens(tasksAndConditions),
    getClosingSurvey(tasksAndConditions),
    DoneScreen,
  ];
}

const VALID_WORDS = "aqua aquacultural aquaculture aquae aqualung aquamarine aquamarines aquanaut aquanauts aquaplaning aquaria aquarium aquariums aquarius aquas aquatic aquatics aquatint aquatinted aquatints aquavit aqueduct aqueducts aqueous aquifer aquifers aquila aquilegia aquiline aquinas aquitaine aquitania equable equal equaled equaling equalisation equalise equalised equaliser equalisers equalises equalising equalitarian equalities equality equalization equalize equalized equalizer equalizers equalizes equalizing equalled equalling equally equals equanimity equanimous equate equated equates equating equation equations equator equatorial equerries equerry equestrian equestrians equiangular equidae equidistant equids equilateral equilibrate equilibrated equilibrates equilibrating equilibration equilibria equilibrium equilibriums equine equines equinoctial equinox equinoxes equip equipage equiped equipes equipment equipments equipoise equipped equipping equips equipt equisetum equitable equitably equitation equities equity equivalence equivalences equivalent equivalents equivocal equivocally equivocate equivocated equivocates equivocating equivocation equivocations squab squabble squabbled squabbles squabbling squabs squad squadron squadrons squads squalid squall squalling squalls squally squalor squalus squama squamata squander squandered squandering squanders square squared squarely squareness squarer squares squaring squarish squash squashed squashes squashing squashy squat squating squats squatted squatter squatters squatting squatty squaw squawk squawked squawking squawks squaws squeak squeaked squeaker squeakers squeaking squeaks squeaky squeal squealed squealer squealers squealing squeals squeamish squeamishness squeegee squeegees squeezable squeeze squeezed squeezer squeezers squeezes squeezing squelch squelched squelches squelching squib squibs squid squids squiffy squiggle squiggles squiggly squill squilla squinch squinches squint squinted squinting squints squinty squire squired squires squiring squirm squirmed squirming squirms squirrel squirrels squirt squirted squirter squirters squirting squirts squish squished squishes squishing squishy".split(
  /\s/
);

const getPracticeScreens = () => [
  {
    preEvent: setupTrialEvent(`practice`, "practice", { domain: "_q" }),
    screen: "Practice",
    view: iobs(({ state }) => {
      const existingIdeas = state.experimentState.ideas;
      const numIdeas = existingIdeas.length;
      const targetIdeaCount = 20;
      const validation = idea => {
        if (idea.length < 2 || idea[1] !== "q") {
          return "Is the second letter 'q'?";
        }
        if (VALID_WORDS.indexOf(idea) === -1) {
          return "Is that an English word?";
        }
        if (existingIdeas.indexOf(idea) !== -1) {
          return "Didn't we already use that one?";
        }
      };
      return (
        <div style={{ maxWidth: "1000px", margin: "0 auto" }}>
          <h1>Practice</h1>
          <p>
            As part of this survey, you'll be using a system that offers
            inspirations. Let's practice using it.
          </p>

          <p>
            In the area below, notice a box on the left, labeled "For
            Inspiration". Clicking the button will show various kinds of
            inspiration&emdash;try it!
          </p>
          <p>
            <b>Task:</b> Try to list 20 English words with "q" as the second
            letter.
          </p>
          <p>
            <b>Remember to try out the inspiration box!</b>
          </p>

          <div style={{ display: "flex", flexFlow: "col nowrap" }}>
            <InspirationBox ideaSource={"the Wordfreq Python package"} />
            <div style={{ flex: "1 0 auto" }}>
              <h2>Words</h2>
              <SmartIdeaList placeholder="_q__" validation={validation} />
            </div>
          </div>
          <p>
            {numIdeas < targetIdeaCount
              ? `Try to get to ${targetIdeaCount} words.`
              : null}
          </p>
          <NextBtn disabled={numIdeas < targetIdeaCount} />
        </div>
      );
    }),
  },
  {
    screen: "PostTaskSurvey",
    view: surveyView({
      title: `Survey after Practice Round`,
      basename: `postBrainstorm-practice`,
      questions: [
        { text: "This is an example of survey you'll get after each task." },
        ...postIdeateSurveyQuestions,
      ],
    }),
  },
];

function brainstormHeader(topicName, targetIdeaCount, idx, total) {
  return (
    <div>
      <h1>
        Preparing to Write an Encyclopedia-Style Article ({idx + 1} of {total})
      </h1>
      <p>
        You're going to write a factual, encyclopedia-style article about{" "}
        <span style={{ color: "orange" }}>{topicName}</span>. Imagine someone
        who doesn't know anything about {topicName} but will read your article
        because they're curious.{" "}
        <b>What factual questions might the reader of the article have?</b>
      </p>

      <ul>
        <li>Goal: at least {targetIdeaCount} questions</li>
        <li>Quantity, not quality.</li>
        <li>Order doesn't matter.</li>
        <li>Complete sentences unneeded.</li>
      </ul>
    </div>
  );
}

function getTask(promptName) {
  if (promptName === "reviewRestaurant") {
    const nameField = "restaurant-name";
    const writingPrompt = (
      <span>
        Write a brief encyclopedia article about
        <i>
          <ControlledInputView name={nameField} />
        </i>{" "}
        that would be useful and interesting for a potential visitor.
        <br /> Make up any details you need.
      </span>
    );
    return {
      flags: {
        domain: "restaurant",
      },
      writingType: {
        singular: "restaurant description article",
        plural: "restaurant description articles",
      },
      writingPrompt,
      nameField,
      topicName: <ControlledInputView name={nameField} />,
      precommitView: withValidation([nameField], () => (
        <div>
          <span>
            Think of a restaurant (or bar, cafe, diner, etc.) that you've been
            to recently that you <b>haven't written about before</b>.
          </span>
          <div
            style={{
              padding: "12px",
              lineHeight: 1.5,
            }}
          >
            Name: <ControlledInput name={nameField} />
            <br />
            About how long ago did you visit, in days?{" "}
            <ControlledInput
              name={"restaurant-daysAgo"}
              type="number"
              min="0"
            />
            <br />
            How would you rate it?{" "}
            <ControlledStarRating name={"restaurant-star"} />
          </div>
        </div>
      )),
      targetIdeaCount: 20,
      wordCountTarget: 120,
      ideaSource: (
        <span>
          Resaurant reviews from the{" "}
          <a
            target="_blank"
            rel="noopener noreferrer"
            href="https://www.yelp.com/dataset"
          >
            Yelp Open Dataset
          </a>
        </span>
      ),
    };
  } else if (promptName === "persuadeMovie") {
    const nameField = "movie-name";
    const writingPrompt = (
      <span>
        Write an endorsement of{" "}
        <i>
          <ControlledInputView name={nameField} />
        </i>{" "}
        that would persuade someone who generally hates that genre to watch it.
      </span>
    );

    return {
      flags: {
        domain: "movie",
      },
      writingType: {
        singular: "movie endorsement",
        plural: "movie endorsements",
      },
      nameField,
      writingPrompt,
      topicName: <ControlledInputView name={nameField} />,
      precommitView: withValidation([nameField], () => (
        <div className="Survey">
          <span>
            What is one of your favorite movies (or TV shows, documentaries,
            etc.)?
          </span>
          <div
            style={{
              padding: "12px",
              lineHeight: 1.5,
            }}
          >
            Name: <ControlledInput name={nameField} />
            <br />
            What <i>genre</i> is it? <ControlledInput name={"movie-genre"} />
          </div>
        </div>
      )),
      targetIdeaCount: 20,
      wordCountTarget: 120,
      ideaSource: <span>Movie reviews from IMDB</span>,
    };
  } else if (promptName === "travelGuide") {
    const nameField = "destination-name";
    const writingPrompt = (
      <span>
        Write a brief encyclopedia article about{" "}
        <i>
          <ControlledInputView name={nameField} />
        </i>{" "}
        that would be useful and interesting for a potential visitor.
        <br /> Make up any details you need.
      </span>
    );

    return {
      flags: {
        domain: "wikivoyage",
      },
      writingType: {
        singular: "travel guide",
        plural: "travel guides",
      },
      visibleName: "travel destination",
      nameField,
      writingPrompt,
      topicName: <ControlledInputView name={nameField} />,
      precommitView: withValidation([nameField], () => (
        <div className="Survey">
          <span>
            What is a travel destination (city, region, national park, etc.)
            that you're familiar with?
          </span>
          <div
            style={{
              padding: "12px",
              lineHeight: 1.5,
            }}
          >
            Destination Name: <ControlledInput name={nameField} />
          </div>
        </div>
      )),

      targetIdeaCount: 20,
      wordCountTarget: 120,
      ideaSource: (
        <span>
          Articles from{" "}
          <a
            href="https://en.wikivoyage.org/wiki/Main_Page"
            target="_blank"
            rel="noopener noreferrer"
          >
            WikiVoyage
          </a>
          , available under the{" "}
          <a
            href="http://creativecommons.org/licenses/by-sa/3.0/"
            target="_blank"
            rel="noopener noreferrer"
          >
            Creative Commons Attribution-ShareAlike 3.0 licence
          </a>
          .
        </span>
      ),
    };
  } else if (promptName === "informNews") {
    const nameField = "news-headline";
    const writingPrompt = (
      <span>
        Write a brief encyclopedia article about the event,{" "}
        <i>
          <ControlledInputView name={nameField} />
        </i>{" "}
        that would be useful and interesting for a potential reader.
        <br /> Make up any details you need.
      </span>
    );
    return {
      flags: {
        domain: "news",
      },
      writingType: {
        singular: "news article",
        plural: "news articles",
      },
      writingPrompt,
      topicName: <ControlledInputView name={nameField} />,
      precommitView: withValidation([nameField], () => (
        <div className="Survey">
          <span>
            Imagine looking at the news and seeing a headline that really makes
            you happy. What is that headline?
          </span>
          <div
            style={{
              padding: "12px",
              lineHeight: 1.5,
            }}
          >
            Headline:
            <br />
            <ControlledInput name={nameField} style={{ width: "300px" }} />
          </div>
        </div>
      )),

      targetIdeaCount: 20,
      wordCountTarget: 120,
      ideaSource: (
        <span>
          Articles from various sources, compiled by the{" "}
          <a
            href="https://summari.es/download/"
            target="_blank"
            rel="noopener noreferrer"
          >
            Cornell Newsroom Summaries Team
          </a>
          .
        </span>
      ),
    };
  } else if (promptName.startsWith("wiki")) {
    let topicNameCode = promptName.slice(5);
    const nameField = `${topicNameCode}-name`;
    const visibleNameMap = {
      book: "book",
      film: "film",
      musician: "musician",
      television: "TV show",
    };
    console.assert(topicNameCode in visibleNameMap);
    const visibleName = visibleNameMap[topicNameCode];
    const writingPrompt = (
      <span>
        Write a brief but informative encyclopedia article about{" "}
        <i>
          <ControlledInputView name={nameField} />
        </i>
        .
        <br /> Make up any details you need.
      </span>
    );

    return {
      flags: {
        domain: promptName,
      },
      visibleName,
      writingType: {
        singular: `an encyclopedia-style article about a ${visibleName}`,
        plural: `encyclopedia-style articles`,
      },
      nameField,
      writingPrompt,
      topicName: <ControlledInputView name={nameField} />,
      precommitView: withValidation([nameField], () => (
        <div>
          <p>
            Name a <b>{visibleName}</b> that you know well.
          </p>
          <div
            style={{
              padding: "12px",
              lineHeight: 1.5,
            }}
          >
            Name of {visibleName}: <ControlledInput name={nameField} />
          </div>
        </div>
      )),

      targetIdeaCount: 20,
      wordCountTarget: 120,
      ideaSource: (
        <span>
          Wikipedia articles, available under the{" "}
          <a
            href="http://creativecommons.org/licenses/by-sa/3.0/"
            target="_blank"
            rel="noopener noreferrer"
          >
            Creative Commons Attribution-ShareAlike 3.0 licence
          </a>
          .
        </span>
      ),
    };
  } else {
    console.assert("Unknown prompt", promptName);
  }
}

const getPrecommitScreen = tasksAndConditions => ({
  screen: "Precommit",
  view: () => (
    <div className="Survey">
      <h1>Pick what to write about</h1>
      <p>
        You're going to be writing <b>brief</b> (~120 words) but{" "}
        <b>informative</b> <b>encyclopedia-style</b> articles on 3 specific
        topics of your choice, <b>without using external resources</b>.
      </p>
      <p>
        First, pick your topics. They should be topics you know reasonably well,
        but don't worry if you don't remember all the facts; you'll be able to
        make up details.
      </p>
      {tasksAndConditions.map(({ task }, idx) => (
        <div key={idx} style={{ borderBottom: "1px solid black" }}>
          {task.precommitView.view()}
        </div>
      ))}
      <NextBtn
        enabledFn={state =>
          tasksAndConditions.every(({ task }) =>
            task.precommitView.complete(state)
          )
        }
      />
    </div>
  ),
});

let postIdeateSurveyQuestions = [
  agreeLikert("fluent", "I felt like I could come up with ideas easily."),
  agreeLikert("stuck", "I sometimes felt stuck."),
  agreeLikert("sysRelevant", "The inspirations were relevant."),
  agreeLikert("sysGaveIdeas", "The inspirations gave me new ideas."),
  agreeLikert("usedInspirations", "I used the inspirations that were given."),
  {
    text: "In what situations did you request inspirations?",
    responseType: "text",
    name: "whenRequest",
    flags: { multiline: true },
  },
  agreeLikert("system-helped", "The system was helpful overall."),
  agreeLikert("distracting", "I would have done better using paper."),
  {
    text:
      "I used outside resources for this task (we'd prefer you didn't, but better to be honest).",
    name: "used-external",
    responseType: "options",
    options: ["Yes", "No"],
  },
  SurveyData.techDiff,
  SurveyData.otherMid,
];

const selfEfficacyQuestions = (idx, topicName) => [
  likert(
    `selfEfficacyWhatToSay-${idx}`,
    <span>
      I am confident that I can <b>think of relevant things to say</b> about{" "}
      <b>{topicName}</b> without relying on outside resources.
    </span>,
    7,
    ["strongly disagree", "strongly agree"]
  ),
  likert(
    `selfEfficacyHowToSay-${idx}`,
    <span>
      I am confident that I can <b>express what I want to say</b> about{" "}
      <b>{topicName}</b> without relying on outside resources.
    </span>,
    7,
    ["strongly disagree", "strongly agree"]
  ),
];

function getPrewritingScreens(tasksAndConditions) {
  let result = [];

  result.push({
    screen: "PreSurvey",
    view: () => (
      <div className="Survey">
        <h1>Preparing to write factual articles</h1>
        <p>
          You are going to be writing brief factual (encyclopedia-like) articles
          on the topics that you listed earlier.
        </p>
        <p>
          In the next few screens, you'll try to list some questions that
          someone might have about the topic before they read your article.
        </p>

        {surveyBody(
          "pre",
          flatMap(tasksAndConditions, ({ prompt, task }, idx) =>
            selfEfficacyQuestions(idx, task.topicName)
          )
        )}

        <NextBtn />
      </div>
    ),
  }); // TODO: Validate that all inputs are present

  tasksAndConditions.forEach(({ prompt, conditionName, task }, idx) => {
    const { targetIdeaCount } = task;
    result.push({
      preEvent: setupTrialEvent(`trial-${idx}`, conditionName, task.flags),
      screen: "PreBrainstormInstructions",
      view: () => (
        <div className="Survey">
          {brainstormHeader(
            task.topicName,
            targetIdeaCount,
            idx,
            tasksAndConditions.length
          )}
          <p>
            An "Inspiration Box" will be available on the next page. The
            inspirations it gives <b>will be different</b> from last time. They
            may be much better or much worse; you'll have to try it to see!
          </p>
          <p>
            Click "Start" when you're ready to start thinking of questions. (All
            of the above will still be available on the next page.)
          </p>
          <NextBtn>Start</NextBtn>
        </div>
      ),
    });
    result.push({
      screen: "ExperimentScreen",
      view: iobs(({ state }) => {
        const numIdeas = state.experimentState.ideas.length;
        return (
          <div style={{ maxWidth: "1000px", margin: "0 auto" }}>
            {brainstormHeader(
              task.topicName,
              targetIdeaCount,
              idx,
              tasksAndConditions.length
            )}
            <div style={{ display: "flex", flexFlow: "col nowrap" }}>
              <InspirationBox ideaSource={task.ideaSource} />
              <div style={{ flex: "1 0 auto" }}>
                <h2>Questions the reader might have:</h2>
                <SmartIdeaList />
              </div>
            </div>
            <p>
              {numIdeas < targetIdeaCount
                ? `Try to get to ${targetIdeaCount} questions.`
                : null}
            </p>
            <NextBtn disabled={numIdeas < targetIdeaCount} />
          </div>
        );
      }),
    });
    result.push({
      screen: "PostTaskSurvey",
      view: surveyView({
        title: `Survey after Pre-writing ${idx + 1} of ${
          tasksAndConditions.length
        }`,
        basename: `postBrainstorm-${idx}`,
        questions: postIdeateSurveyQuestions,
      }),
    });
  });

  return result;
}

const WordCountTargetAdvance = iobs(({ state, targetWords }) => {
  let { wordCount } = state.experimentState;
  let allowAdvance = wordCount >= targetWords;
  return (
    <div>
      <p>
        Word count: {state.experimentState.wordCount} (target: {targetWords})
        <br />
        <NextBtn disabled={state.experimentState.wordCount < targetWords}>
          {allowAdvance ? "Submit" : `Please write some more.`}
        </NextBtn>
      </p>
    </div>
  );
});

function getFinalWritingScreens(tasksAndConditions) {
  return flatMap(tasksAndConditions, ({ task, prompt, conditionName }, idx) => {
    const header = (
      <div>
        <h1>
          Writing {idx + 1} of {tasksAndConditions.length}
        </h1>
        <p
          style={{
            border: "1px solid black",
            padding: "5px",
            fontSize: "14pt",
          }}
        >
          {task.writingPrompt}
        </p>
        <p>
          Here are the questions you listed earlier. You are not obligated to
          use them.
        </p>
        <div style={{ fontSize: "10pt", columnCount: "2" }}>
          <SmartIdeaList fixed />
        </div>
        <p>Aim for about {task.wordCountTarget} words.</p>
      </div>
    );
    return [
      {
        preEvent: {
          type: "switchToTrial",
          name: `trial-${idx}`,
        },
        screen: "Instructions",
        view: () => (
          <div className="Survey">
            {header}
            <p>
              Click "Start" to begin. (All of the above will still be available
              on the next page.)
            </p>
            <NextBtn>Start</NextBtn>
          </div>
        ),
      },
      {
        screen: "ExperimentScreen2",
        view: () => (
          <div style={{ maxWidth: "1000px", margin: "0 auto" }}>
            {header}
            <WritingView />
            <WordCountTargetAdvance targetWords={task.wordCountTarget} />
          </div>
        ),
      },
      {
        screen: "PostWritingSurvey",
        view: surveyView({
          title: `Survey after Writing ${idx + 1} of ${
            tasksAndConditions.length
          }`,
          basename: `postWriting-${idx}`,
          questions: [
            likert("thinkVsType", "I spent my time...", 7, [
              "Thinking",
              "Typing",
            ]),
            {
              text: "Describe how you chose what to say.",
              responseType: "text",
              name: "whatToSay",
              flags: { multiline: true },
            },
            {
              text: "Describe how you chose how to say it.",
              responseType: "text",
              name: "howToSayIt",
              flags: { multiline: true },
            },
            {
              text: "Other comments?",
              responseType: "text",
              name: "other",
              optional: true,
              placeholder: "(optional)",
              flags: { multiline: true },
            },
          ],
        }),
      },
    ];
  });
}

function getClosingSurvey(tasksAndConditions) {
  return {
    screen: "PostExpSurvey",
    view: surveyView({
      title: "Closing Survey",
      basename: "postExp",
      questions: [
        SurveyData.age,
        SurveyData.gender,
        SurveyData.english_proficiency,
        ...flatMap(tasksAndConditions, ({ prompt, task }, idx) =>
          selfEfficacyQuestions(
            idx,
            <span>
              a {task.visibleName} other than {task.topicName}
            </span>
          )
        ),

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
        SurveyData.techDiff,
        SurveyData.otherFinal,
      ],
    }),
  };
}

function setupTrialEvent(name: string, condition: string, flags: ?Object) {
  if (!(condition in namedConditions)) {
    throw new Error(`Invalid condition name: ${condition}`);
  }
  return {
    type: "setupTrial",
    name,
    flags: {
      condition,
      ...namedConditions[condition],
      ...flags,
    },
  };
}

let conditionOrders = shuffle.permutator(baseConditions);

export function createTaskState(loginEvent: {
  participant_id: string,
  assignment: number,
  prompt: string,
}) {
  let clientId = loginEvent.participant_id;

  let prompts,
    conditions,
    isDemo = false;
  if (clientId.slice(0, 4) === "demo") {
    // Demo URLs are formatted: `demo(config)-(condition)-(prompt)-p`
    let match = clientId.match(/^demo(\w+)-(\w+)-([-\w]+)$/);
    console.assert(match);
    let condition = match[2];
    conditions = [condition, condition, condition];
    prompts = [match[3]];
    isDemo = true;
  } else {
    if ("n_groups" in loginEvent) {
      console.assert(loginEvent.n_groups === conditionOrders.length);
    } else {
      // showall doesn't provide n_groups because it doesn't talk with the backend.
      console.assert(window.location.search.includes("showall"));
    }
    conditions = conditionOrders[loginEvent.assignment];
    // prompts = ["reviewRestaurant", "travelGuide", "informNews"];
    prompts = ["wiki-book", "wiki-film", "travelGuide"];
  }

  // Get task setup.
  let screens = getScreens(prompts, conditions, isDemo);

  let state = createState({
    clientId,
    screens,
    createExperimentState: flags => new TrialState(flags),
    timeEstimate: "30 minutes",
  });
  finalDataLogger(state);

  return state;
}

export function screenToView(screenDesc: Screen) {
  console.assert(screenDesc.view);
  return React.createElement(screenDesc.view);
}
