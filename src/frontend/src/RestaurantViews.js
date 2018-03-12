const texts = {
  detailed: {
    overallInstructions: <span>Write the true story of your experience. Tell your reader <b>as many vivid details as you can</b>. Don't worry about <em>summarizing</em> or <em>giving recommendations</em>.</span>,
    brainstormingInstructions: <span><b>Brainstorm what you might want to talk about</b> by typing anything that comes to mind, even if it's not entirely accurate. Don't worry about grammar, coherence, accuracy, or anything else, this is just for you. <b>Have fun with it</b>, we'll write the real thing in step 2.</span>,
    revisionInstructions: <span>Okay, this time for real. Try to make it reasonably accurate and coherent.</span>,
    instructionsQuiz: 'SV_42ziiSrsZzOdBul',
  },
  detailedNoBrainstorm: {
    overallInstructions: <span>Write the true story of your experience. Tell your reader <b>as many vivid details as you can</b>. Don't worry about <em>summarizing</em> or <em>giving recommendations</em>.</span>,
    revisionInstructions: <span>Try to make it reasonably accurate and coherent.</span>,
    instructionsQuiz: 'SV_42ziiSrsZzOdBul',
  },
  funny: {
    overallInstructions: <span>Write the <b>funniest</b> review you can come up with. Have fun with it!</span>,
    brainstormingInstructions: <span><b>Brainstorm what you might want to talk about</b> by typing anything that comes to mind, even if it's not entirely accurate. Don't worry about grammar, coherence, accuracy, or anything else, this is just for you. <b>Have fun with it</b>, we'll write the real thing in step 2.</span>,
    revisionInstructions: <span>Okay, this time for real. Try to make it reasonably accurate and coherent -- but still funny!</span>,
    instructionsQuiz: null,
  },
  review: {
    overallInstructions: <span>Write a review of your experience that you'd be proud to post on a review website. Use at least {wordCountTarget} words. We'll bonus our favorite reviews!</span>,
    brainstormingInstructions: <span />,
    revisionInstructions: <span/>,
    instructionsQuiz: null,
  },
  tabooTopic: {
    overallInstructions: <span>Write a review of your experience <b>that tells us something new</b>, something that other reviews probably don't tell us. Specifically, other reviews already talk a lot about the <em>food</em>, <em>service</em>, and <em>atmosphere</em>, so try to <b>focus on other topics</b>. <br/><br/>Use at least {wordCountTarget} words. We'll bonus our favorite reviews!</span>,
    brainstormingInstructions: <span />,
    revisionInstructions: <span/>,
    instructionsQuiz: null,
  },
  sentiment: {
    overallInstructions: <span>Write a review of your experience. Include <b>both positive and negative aspects</b>. Use at least {wordCountTarget} words. We'll bonus our favorite reviews!</span>,
    brainstormingInstructions: <span />,
    revisionInstructions: <span/>,
    instructionsQuiz: null,
  },
  yelp: {
    overallInstructions: <span>
      Write a review of your experience. &ldquo;<em>The best reviews are passionate, personal, and accurate.
      They offer a rich narrative, a wealth of detail, and a helpful tip or two for other consumers.</em>&rdquo; (based on Yelp's Guidelines)...
      and please try to avoid typos. <b>We'll bonus our favorite reviews</b>!
    </span>,
    brainstormingInstructions: null,
    revisionInstructions: null,
    instructionsQuiz: null,
  },
  persuade: {
    overallInstructions: null
  }
};


const OverallInstructions = inject('state')(observer(({state}) => {
  if (state.masterConfig.instructions === 'persuade') {
    return <div>Write a review that convinces someone to <b>{state.persuadePos ? "check out" : "avoid"} this restaurant</b>. The most convincing reviews will get $0.50 bonuses each!
    <br/><br/>
    Tips to make your review more persuasive:
    <ul>
      <li>Give both positives and negatives</li>
      <li>Be as specific and descriptive as possible</li>
      <li>Evaluate the entire experience</li>
    </ul>
    </div>;
  }
  return <p>{texts[state.masterConfig.instructions].overallInstructions}</p>;
}));


export const ExperimentOutline = inject('state')(observer(({state}) => {
  let numPlaces = state.conditions.length;
  return <div>
    <h1>Experiment Outline</h1>
    <p>In this experiment, you'll:</p>
    <ol>
      <li>Complete a tutorial to learn how to use a new keyboard,</li>
      <li>Write short reviews of {numPlaces} restaurants of your choice,</li>
      <li>Answer a few questions about each review, and some overall questions at the end, and</li>
      <li>Complete a demographic and personality questionnaire.</li>
    </ol>
  </div>;
}))





export const ShowReviews = inject('state')(observer(({state}) => <div>
    <p>Here's what you wrote:</p>
    {state.places.map(({name}, idx) => <div key={idx}>
      <h1>{idx+1}: {name}</h1>
      <div style={{border: '1px solid black', margin: '5px'}}>{state.experiments.get(`final-${idx}`).curText}</div>
    </div>)}
  </div>));




export const SelectRestaurants = inject('state')(observer(({state}) => {
  let numPlaces = state.conditions.length;
  let indices = state.conditions.map((condition, idx) => idx + 1);
  let groups = [{header: null, indices}];
  if (state.masterConfigName === 'sent4') {
    groups = [
      {header: "Above-average experiences", indices: [1, 2]},
      {header: "Below-average experiences", indices: [3, 4]}
    ];
  }
  let allFields = [];
  indices.forEach(idx => {
    ['restaurant', 'visit', 'star', 'knowWhat'].forEach(kind => {
      if (kind === 'knowWhat' && !askKnowWhatToSay) return;
      allFields.push(`${kind}${idx}`);
    });
  });
  let complete = _.every(allFields, x => state.controlledInputs.get(x))

  return <div className="SelectRestaurants">
    <ExperimentOutline />

    <p>Before we get started, we want to make sure you'll be able to write about {numPlaces} different restaurant visits. So  <b>think of {numPlaces} restaurants (or bars, cafes, diners, etc.)</b> you've been to recently that you <b>haven't written about before</b>.</p>
    {state.masterConfigName === 'sent4' && <p>Try to pick 2 above-average experiences and 2 below-average experiences.</p>}

    {groups.map(({header, indices: groupIndices}, groupIdx) => <div key={groupIdx} style={{borderLeft: '2px solid black', paddingLeft: '5px'}}>
      {header && <h3>{header}</h3>}
      {groupIndices.map(idx => <RestaurantPrompt  key={idx} idx={idx} />)}
    </div>)}

    {complete || <p>(The Next button will be enabled once all fields are filled out.)</p>}
    <NextBtn disabled={!complete} />
  </div>;
}));


export const ReadyPhone = inject('state')(observer(({state}) => <div>
    <h1>Writing task {state.block + 1} of {state.conditions.length}</h1>
    <p>We'll be writing about <b>{state.curPlace.name}</b>.</p>
    <OverallInstructions />
    <p>{texts[state.masterConfig.instructions].revisionInstructions}</p>
    {state.condition.useAttentionCheck && <p>For this study, we need to measure which parts of the screen people are paying attention to. So if you happen to notice an "æ" somewhere, tap it to acknowledge that you saw it. (Don't worry if you happen to miss a few, and sorry if it gets annoying.)</p>}

    <p>For this writing session, you'll be using <b>Keyboard {state.block + 1}</b>. Each keyboard works a little differently.</p>

    <p>Tap Next when you're ready to start.<br/><br/><NextBtn /></p></div>
));




function RestaurantPrompt({idx}) {
  return <div key={idx} className="Restaurant">{idx}.
      Name of the place: <ControlledInput name={`restaurant${idx}`} /><br />
    About how long ago were you there, in days? <ControlledInput name={`visit${idx}`} type="number" min="0"/>
    <br />How would you rate that visit? <ControlledStarRating name={`star${idx}`} />
    {askKnowWhatToSay && <span><br/><br />On a scale of 1 to 5, do you already know what you want to say about this experience? 1="I haven't thought about it at all yet", 5="I know exactly what I want to say"<br/>
    <ControlledInput name={`knowWhat${idx}`} type="number" min="1" max="5" /></span>}
  </div>;
}

export const SelectRestaurantsPersuade = inject('state')(observer(({state}) => {
  console.assert(state.conditions.length === 3);
  return <div className="SelectRestaurants">
    <ExperimentOutline />

    <blockquote>
      <p>Your task:</p>
      Suppose someone is just moving to your town and wants to check out some restaurants (or bars, cafes, diners, etc.). Pick <b>two restaurants</b> that{" "}
          <b>they should visit</b>{" "}
          and <b>one</b> that <b>they should avoid</b>. As part of
          this study, we will write reviews of the three restaurants that
          convince your reader to go, or not go.
    </blockquote>

    Restaurants <b>they should visit</b>:
    <ol>
      {[1, 2].map(idx => <li key={idx}><ControlledInput name={`restaurant${idx}`} /></li>)}
    </ol>

    Restaurants <b>they should avoid</b>:
    <ol start="3">
      {[3].map(idx => <li key={idx}><ControlledInput name={`restaurant${idx}`} /></li>)}
    </ol>

    <NextBtn disabled={!_.every([1,2,3], x => state.controlledInputs.get(`restaurant${x}`)) }/>
  </div>
}));


export const Instructions = inject('state')(observer(({state}) => {
    let inExperiment = state.curScreen.screen === 'ExperimentScreen';
    return <div>
      <h1>{state.curPlace.name}!</h1>
      <p style={{border: '1px solid black', padding: '2px'}}>{texts[state.masterConfig.instructions].overallInstructions}</p>
      <hr/>
      {state.passedQuiz || inExperiment || texts[state.masterConfig.instructions].instructionsQuiz === null
        ? <p>Use your phone to complete this step.</p>
        : <p>Your phone shows a brief quiz on these instructions. Once you've passed the quiz, look back here.</p>}
      <p>The shortcuts will be different from what you saw before.</p>
    </div>;
  }));

