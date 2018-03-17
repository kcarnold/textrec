import React, { Component } from 'react';
import _ from 'lodash';
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
    let allTasksDone = _.every(['typeKeyboard', 'megaBackspace', 'specialChars', 'tapSuggestion'].map(name => state.tutorialTasks.tasks[name]));
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

export const PracticeComputer = inject('state', 'dispatch')(observer(({state, dispatch}) => {
  let previewPhrase3;
  try {
    previewPhrase3 = state.experimentState.visibleSuggestions.predictions[0].words.slice(0, 3).join(' ');
  } catch (e) {
    previewPhrase3 = '(nothing right now)';
  }
    return <div className="Tutorial">
      <h1>Tutorial (part 1 of 2)</h1>

      <p>For technical reasons, we have to use a special keyboard for this experiment. It might feel harder to type with it than your ordinary keyboard, and it's missing some characters you may want to type, sorry about that.
      But it has a few special features that you get to try out! (scroll this section down...)</p>

      <ul>
        <li>Try the shortcut buttons to insert words:<br/>
        <TutorialTodo done={state.tutorialTasks.tasks.tapSuggestion}>Tap one of the boxes to insert that word.</TutorialTodo>
        </li>
        <li>To help you get used to the shortcuts, if you start typing out a word that you could use a shortcut for, the shortcut will light up. Try it: <b>tap the first few letters of the word in the leftmost box</b> and notice what happens.</li>
        <li>Each shortcut button shows a preview of the words that it will insert if you tap it repeatedly. For example, if you triple-tap the box on the left, it will insert &ldquo;<tt>{previewPhrase3}</tt>&rdquo;.
        <TutorialTodo done={state.tutorialTasks.tasks.doubleTap}>Try a <b>double-tap</b> to insert two words.</TutorialTodo>
        </li>
      </ul>

      <p>Occasionally, double-tapping may cause your phone to zoom its screen. If that happens, reload the page (you won't lose your work).</p>

      Of course, the keys also work. To keep things simple, there's no upper-case, and just a limited amount of punctuation.
      {['typeKeyboard', 'megaBackspace', 'undo', 'specialChars'].map(name => <TutorialTodo key={name} done={state.tutorialTasks.tasks[name]}>{tutorialTaskDescs[name]}</TutorialTodo>)}

      <p>Don't worry about capitalization, numbers, or anything else that isn't on the keyboard. And the only way to edit earlier text is to delete and retype it (sorry about that, we're just lowly research programmers!).</p>
      {_.every(['typeKeyboard', 'megaBackspace', 'specialChars', 'tapSuggestion', 'doubleTap'].map(name => state.tutorialTasks.tasks[name])) ? <p>
        Ready for the second part of the tutorial? Tap <NextBtn />.</p> : <p>Complete all of the steps above to move on.</p>}
    </div>;
  }));

export const TutorialInstructions = inject('state', 'dispatch')(observer(({state, dispatch}) => {
  let { curText } = state.experimentState;
  let hasPeriod = curText.indexOf('.') !== -1;
  let hasSentence = hasPeriod && curText.length > 10;
  return <div className="Tutorial">
    <h1>Tutorial (part 2 of 2)</h1>

    <p>Ok now to try actually writing something. We're still in the tutorial, so it'll be something really simple.</p>

    <p><b>Tutorial task</b>:</p>

    <ul>
      <li>Think of a residence that you know well, such as where you live now or where you grew up.</li>
      <li>Imagine you're writing a description of it for a site like Airbnb or Craigslist. (Please don't include any information that would identify you.)</li>
      <li><b>Write a sentence about the interior of the residence.</b></li>
      <li>Try to write it using <b>as few taps</b> as possible. Don't worry about capitalization, numbers, or anything else that isn't on the keyboard.</li>
    </ul>

    {!hasSentence && <p><b>Please type a complete sentence before moving on.</b></p>}

    <p>Once you've typed a complete sentence (a few words and a period), click <NextBtn />.</p>
  </div>;
}));

export const PracticeAlternativesInstructions = inject('state', 'dispatch')(observer(({state, dispatch}) => {
    return <div>
      <p>Now we've changed the keyboard a little.</p>
      <ul>
        <li>After you type a word, it will be highlighted in green.</li>
        <li>Green boxes will show alternatives to that word.</li>
        <li>Tap any of the alternatives to use it <em>instead of</em> the green word.</li>
      </ul>

      <p><b>Practice task</b>: Write the same sentence again, but try out some of the alternatives.</p>

      {_.every(['tapAlternative'].map(name => state.tutorialTasks.tasks[name])) ? <p>
        After you've written your sentence, click here: <NextBtn />.</p> : <p>Make sure you try out the alternatives :)</p>}
    </div>;
  }));


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

export const SummaryInstructions = inject('state')(observer(({state}) => <div>
  After you're done, scroll back up and click here: <NextBtn disabled={state.experimentState.wordCount < 10} />
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
      PracticeComputer: PracticeComputer,
      TutorialInstructions: TutorialInstructions,
      SummaryInstructions: SummaryInstructions,
    }
    let instructionsScreenName = state.screens[state.screenNum].instructionsScreen;
    let instructionEltProto;
    if (state.isDemo) {
      instructionEltProto = 'div';
    } else {
      console.assert(instructionsScreenName in instructionsScreens, instructionsScreenName);
      instructionEltProto = instructionsScreens[instructionsScreenName];
    }
    let instructionElt = React.createElement(
      instructionEltProto,
      {ref: elt => this.ref = elt});
    return <div className="header scrollable">
      <div style={{padding: '5px'}}>{instructionElt}</div>
      <div>{state.experimentState.stimulus}</div>
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
        <ExperimentHead key={state.screens[state.screenNum].instructionsScreen} />
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

