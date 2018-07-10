import React, { Component } from "react";
import every from "lodash/every";
import { observer, inject } from "mobx-react";
import { Keyboard } from "./Keyboard";
import { NextBtn } from "./BaseViews";
import { CurText } from "./CurText";
import { SuggestionsBar } from "./SuggestionViews";
import Consent from "./Consent";

const SITE_DOWN = false;

const tutorialTaskDescs = {
  typeKeyboard: "Type a few words by tapping letters on the keyboard.",
  megaBackspace:
    "Try deleting a few letters at a time by swiping the backspace key left or right.",
  undo: 'Tap the "undo" button (in the lower right) to undo your last action.',
  specialChars: "Try typing some punctuation (period, comma, apostrophe, etc.)",
  tapSuggestion: "Try tapping a box to insert the word.",
  tapPrediction: "Try tapping a grey box to insert the word.",
  tapAlternative:
    "Try tapping a green box to replace the highlighted word with it.",
};

const TutorialTodo = ({ done, children }) => (
  <div style={{ color: done ? "green" : "red" }}>
    {done ? "\u2611" : "\u2610"} {children}
  </div>
);

export const PracticeWord = inject("state", "dispatch")(
  observer(({ state, dispatch }) => {
    let allTasksDone = every(
      ["typeKeyboard", "megaBackspace", "specialChars", "tapSuggestion"].map(
        name => state.tutorialTasks.tasks[name]
      )
    );
    return (
      <div>
        <p>
          For technical reasons, we have to use a special keyboard for this
          experiment. It will probably feel harder to type with than your
          ordinary keyboard, and it's missing some characters you may want to
          type, sorry about that.
        </p>
        <p>Let's get a little practice with it:</p>
        {["typeKeyboard", "megaBackspace", "specialChars"].map(name => (
          <TutorialTodo key={name} done={state.tutorialTasks.tasks[name]}>
            {tutorialTaskDescs[name]}
          </TutorialTodo>
        ))}
        <p>
          Don't worry about capitalization, numbers, or anything else that isn't
          on the keyboard.
        </p>

        <p>
          Notice the 3 boxes above the keyboard. Each one shows a word, tap a
          word to insert it.
        </p>
        {["tapSuggestion"].map(name => (
          <TutorialTodo key={name} done={state.tutorialTasks.tasks[name]}>
            {tutorialTaskDescs[name]}
          </TutorialTodo>
        ))}
        {allTasksDone ? (
          <p>
            When you're ready, click here to move on: <NextBtn />.
          </p>
        ) : (
          <p>Complete all of the tutorial steps to move on.</p>
        )}
      </div>
    );
  })
);

export const TutorialInstructions = inject("state", "dispatch")(
  observer(({ state, dispatch }) => {
    return <div />;
  })
);

// export const TranscribeTask = inject('state', 'dispatch')(observer(({state, dispatch}) => {
//   let phrase = state.experimentState.transcribe;
//   return <div>
//   </div>;
// }));

export const Welcome = inject("state")(
  observer(({ state }) => (
    <div>
      {SITE_DOWN && (
        <h1 style={{ paddingBottom: "2500px" }}>
          Site down for maintenance, please try again in a few hours.
        </h1>
      )}
      <h1>Welcome</h1>
      <p>
        You should be seeing this page on a touchscreen device. If not, get one
        and go to this page's URL (<tt>{window.location.href}</tt>).
      </p>
      <Consent
        timeEstimate={state.timeEstimate}
        platform={state.platform}
      />
      <p>
        If you consent to participate, and if you're seeing this{" "}
        <b>on a touchscreen device</b>, tap here: <NextBtn />
      </p>
    </div>
  ))
);

const ExperimentHead = inject("state", "spying")(
  observer(
    class ExperimentHead extends Component {
      componentDidMount() {
        if (!this.props.spying) {
          this.ref.scrollTop = 0;
        }
      }

      render() {
        return (
          <div className="header scrollable" ref={elt => (this.ref = elt)}>
            <div style={{ padding: "5px" }}>{this.props.instructions}</div>
          </div>
        );
      }
    }
  )
);

export const ExperimentScreen = inject("state", "dispatch")(
  observer(({ state, dispatch, instructions }) => {
    let { experimentState } = state;
    if (state.phoneSize.width > state.phoneSize.height) {
      return (
        <h1>Please rotate your phone to be in the portrait orientation.</h1>
      );
    }

    return (
      <div className="ExperimentScreen">
        <ExperimentHead instructions={instructions} />
        <CurText text={experimentState.curText} />
        <div>
          {!experimentState.flags.hideRecs && (
            <SuggestionsBar
              which="predictions"
              suggestions={experimentState.visibleSuggestions["predictions"]}
              showPhrase={experimentState.flags.showPhrase}
            />
          )}
        </div>
        <Keyboard dispatch={dispatch} />
      </div>
    );
  })
);

export const Done = inject("clientId", "state")(
  observer(({ clientId, state }) => (
    <div>
      Thanks! Your code is <tt style={{ fontSize: "20pt" }}>{clientId}</tt>
      <br />
      <br />
      {state.isHDSL && (
        <p>
          Your participation has been logged. Expect to receive a gift
          certificate by email in the next few days. Thanks!
          <img src={state.sonaCreditLink} alt="" />
        </p>
      )}
    </div>
  ))
);
