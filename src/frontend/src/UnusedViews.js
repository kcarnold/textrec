
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
