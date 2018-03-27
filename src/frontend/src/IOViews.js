import React, { Component } from 'react';
import every from 'lodash/every';
import {observer, inject} from 'mobx-react';
import classNames from 'classnames';
import {Keyboard} from './Keyboard';
import {NextBtn} from './BaseViews';
import {CurText} from './CurText';
import {SuggestionsBar, AlternativesBar} from './SuggestionViews';
import Consent from './Consent';

export {IntroSurvey, PostTaskSurvey, PostExpSurvey} from './Surveys';

const SITE_DOWN = false;

const hostname = window.location.host;

const wordCountTarget = 75;
const askKnowWhatToSay = false;

const tutorialTaskDescs = {
  typeKeyboard: 'Type a few words by tapping letters on the keyboard.',
  megaBackspace: 'Try deleting a few letters at a time by swiping the backspace key left or right.',
  undo: 'Tap the "undo" button (in the lower right) to undo your last action.',
  specialChars: 'Try typing some punctuation (period, comma, apostrophe, etc.)',
  tapSuggestion: 'Try tapping a box to insert the word.',
  tapPrediction: 'Try tapping a grey box to insert the word.',
  tapAlternative: "Try tapping a green box to replace the highlighted word with it."
};


const TutorialTodo = ({done, children}) => <div style={{color: done ? 'green' : 'red'}}>{done ? '\u2611' : '\u2610'} {children}</div>;

export const PracticeWord = inject('state', 'dispatch')(observer(({state, dispatch}) => {
    let allTasksDone = every(['typeKeyboard', 'megaBackspace', 'specialChars', 'tapSuggestion'].map(name => state.tutorialTasks.tasks[name]));
    return <div>
      <p>For technical reasons, we have to use a special keyboard for this experiment. It will probably feel harder to type with than your ordinary keyboard, and it's missing some characters you may want to type, sorry about that.</p>
      <p>Let's get a little practice with it:</p>
      {['typeKeyboard', 'megaBackspace', 'specialChars'].map(name => <TutorialTodo key={name} done={state.tutorialTasks.tasks[name]}>{tutorialTaskDescs[name]}</TutorialTodo>)}
      <p>Don't worry about capitalization, numbers, or anything else that isn't on the keyboard.</p>

      <p>Notice the 3 boxes above the keyboard. Each one shows a word, tap a word to insert it.</p>
      {['tapSuggestion'].map(name => <TutorialTodo key={name} done={state.tutorialTasks.tasks[name]}>{tutorialTaskDescs[name]}</TutorialTodo>)}
      {allTasksDone ? <p>When you're ready, click here to move on: <NextBtn />.</p> : <p>Complete all of the tutorial steps to move on.</p>}
    </div>;
  }));

export const TutorialInstructions = inject('state', 'dispatch')(observer(({state, dispatch}) => {
  return <div />;
}));


export const TranscribeTask = inject('state', 'dispatch')(observer(({state, dispatch}) => {
  let phrase = state.experimentState.transcribe;
  return <div>
    <p><b>Warm-up!</b></p>
    <p>For technical reasons, we have to use a special keyboard for this study. We'll type a few news headlines to start off so you get used to it.</p>
    <p><b>Type this:</b><br/>
    <div style={{background: 'white'}}>
      {phrase}
    </div></p>
    <NextBtn />
  </div>;
}));

export const TaskDescription = () => <div>
  <p>In this study we're going to be writing headlines from news stories. You already typed a few of them during the warm-up.</p>

  <p>You will read a news article, then write a headline of 75 words or less.</p>

<NextBtn />
  </div>;

export const Welcome = inject('state')(observer(({state}) => <div>
    {SITE_DOWN && <h1 style={{paddingBottom: "2500px"}}>Site down for maintenance, please try again in a few hours.</h1>}
    <h1>Welcome</h1>
    <p>You should be seeing this page on a touchscreen device. If not, get one and go to this page's URL (<tt>{window.location.href}</tt>).</p>
    <Consent timeEstimate={state.timeEstimate} isMTurk={state.isMTurk} persuade={state.isPersuade} />
    <p>If you consent to participate, and if you're seeing this <b>on a touchscreen device</b>, tap here: <NextBtn /></p>
  </div>));


export const Instructions = inject('state')(observer(({state}) => <div>
    <h1>Writing task {state.block + 1} of {state.conditions.length}</h1>

    <p>For this writing session, you'll be using <b>Keyboard {state.block + 1}</b>. Each keyboard works a little differently.</p>

    <p>Tap Next when you're ready to start.<br/><br/><NextBtn /></p></div>
));

const urlForImage = (content) => {
  console.assert(content.length === 12);
  return `http://images.cocodataset.org/train2017/${content}.jpg`
}

export const StimulusView = ({stimulus}) => {
  if (stimulus.type === 'doc') {
    return <div
      style={{whiteSpace: 'pre-line', background: 'white', margin: '5px 2px'}}>
      {stimulus.content}
    </div>
  } else if (stimulus.type === 'img') {
    return <div><img src={urlForImage(stimulus.content)} /></div>;
  }
};

export const SummaryInstructions = inject('state')(observer(({state}) => <div>
  Write a headline for this article in the space below. After you're done, click here: <NextBtn disabled={state.experimentState.wordCount < 10} />
  <StimulusView stimulus={state.experimentState.stimulus} />
  </div>));


const ExperimentHead = inject('state', 'spying')(observer(class ExperimentHead extends Component {
  componentDidMount() {
    if (!this.props.spying) {
      this.ref.scrollTop = 0;
    }
  }

  render() {
    let {state} = this.props;
    let instructionsScreens = {
      PracticeWord: PracticeWord,
      TranscribeTask: TranscribeTask,
      TutorialInstructions: TutorialInstructions,
      SummaryInstructions: SummaryInstructions,
    }
    let instructionsScreenName = state.curScreen.instructionsScreen;
    let instructionEltProto;
    console.assert(instructionsScreenName in instructionsScreens, instructionsScreenName);
    instructionEltProto = instructionsScreens[instructionsScreenName];
    let instructionElt = React.createElement(
      instructionEltProto,
      {ref: elt => this.ref = elt});
    return <div className="header scrollable">
      <div style={{padding: '5px'}}>{instructionElt}</div>
    </div>;
  }
}));

export const ExperimentScreen = inject('state', 'dispatch')(observer(({state, dispatch}) => {
      let {experimentState} = state;
      let {showReplacement, showPredictions, showSynonyms} = state.experimentState;
      if (state.phoneSize.width > state.phoneSize.height) {
        return <h1>Please rotate your phone to be in the portrait orientation.</h1>;
      }

      return <div className="ExperimentScreen">
        <ExperimentHead key={state.curScreen.instructionsScreen} />
        {showSynonyms &&
          <SuggestionsBar
            which="synonyms"
            suggestions={experimentState.visibleSuggestions["synonyms"]}
            beforeText={""}
          />}
        <CurText text={experimentState.curText} replacementRange={showReplacement && experimentState.visibleSuggestions['replacement_range']} />
        {state.condition.alternatives ? <AlternativesBar /> : <div>
          {showPredictions && <SuggestionsBar which="predictions" suggestions={experimentState.visibleSuggestions['predictions']} showPhrase={state.condition.showPhrase} />}
        </div>}
        <Keyboard dispatch={dispatch} />
      </div>;
    }));

export const Done = inject('clientId', 'state')(observer(({clientId, state}) => <div>Thanks! Your code is <tt style={{fontSize: '20pt'}}>{clientId}</tt><br/><br />
  {state.isHDSL && <p>Your participation has been logged. Expect to receive a gift certificate by email in the next few days. Thanks!
    <img src={state.sonaCreditLink} alt="" /></p>}
  </div>));

