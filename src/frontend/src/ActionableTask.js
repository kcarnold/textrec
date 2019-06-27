/**
 * @format
 */

import * as React from "react";
import { extendObservable, decorate, action } from "mobx";

import flatMap from "lodash/flatMap";
import { createState } from "./MasterState";
import * as Views from "./CueViews";
import { NextBtn } from "./BaseViews";
import {
  likert,
  OptionsResponse,
  LikertResponse,
  surveyView,
  surveyBody,
  agreeLikert,
  allQuestionsAnswered,
} from "./SurveyViews";
import * as SurveyData from "./SurveyData";
import { ControlledInput, ControlledInputView } from "./ControlledInputs";
import { finalDataLogger, iobs } from "./misc";

import * as shuffle from "./shuffle";

let baseConditions = ["noprompt", "verbatim", "questions"];
let conditionOrders = shuffle.permutator(baseConditions);

const cuesByPrompt = {
  "wiki-book": [
    {
      type: "fiction",
      source: "Sir Gawain and the Green Knight",
      verbatim:
        "It is one of the best known Arthurian stories, with its plot combining two types of folklore motifs, the beheading game and the exchange of winnings.",
      questions:
        "What type of story is it? How well-known is it? What are some of its major plot characteristics?",
    },
    {
      type: "fiction",
      source: "Sir Gawain and the Green Knight",
      verbatim:
        "It draws on Welsh, Irish, and English stories, as well as the French chivalric tradition.",
      questions: "What are its major influences?",
    },
    {
      type: "fiction",
      source: "Sir Gawain and the Green Knight",
      verbatim:
        "It is an important example of a chivalric romance, which typically involves a hero who goes on a quest which tests his prowess.",
      questions:
        "What genre does it exemplify? What characteristizes that genre?",
    },
    {
      type: "fiction",
      source: "Sir Gawain and the Green Knight",
      verbatim:
        "It remains popular to this day in modern English renderings from J. R. R. Tolkien, Simon Armitage, and others, as well as through film and stage adaptations.",
      questions: "Is it still popular? Does it have film or stage adaptations?",
    },
    {
      type: "fiction",
      source: "Sir Gawain and the Green Knight",
      verbatim:
        'It describes how Sir Gawain, a knight of King Arthur\'s Round Table, accepts a challenge from a mysterious "Green Knight" who challenges any knight to strike him with his axe if he will take a return blow in a year and a day.',
      questions:
        "Who is the main character? What is their main attribute? What is the central plot element?",
    },
    {
      type: "fiction",
      source: "Candide",
      verbatim:
        'The novella has been widely translated, with English versions titled Candide: or, All for the Best (1759); Candide: or, The Optimist (1762); and Candide: Optimism""\' (1947).',
      questions: "Has it been translated? What is its translated title?",
    },
    {
      type: "fiction",
      source: "Candide",
      verbatim:
        "Candide is characterized by its  tone as well as by its erratic, fantastical, and fast-moving plot.",
      questions:
        "What are some distinguishing attributes of the writing and plot?",
    },
    {
      type: "fiction",
      source: "Candide",
      verbatim:
        "Still, the events discussed are often based on historical happenings, such as the Seven Years' War and the 1755 Lisbon earthquake.",
      questions: "Is the plot based on historical events?",
    },
    {
      type: "fiction",
      source: "Candide",
      verbatim:
        "As philosophers of Voltaire's day contended with the problem of evil, so does Candide in this short novel, albeit more directly and humorously.",
      questions: "What philosophical subjects does the book address?",
    },
    {
      type: "fiction",
      source: "Candide",
      verbatim:
        "Immediately after its secretive publication, the book was widely banned to the public because it contained religious blasphemy, political sedition, and intellectual hostility hidden under a thin veil of na\u00efvet\u00e9.",
      questions: "What reaction did the book get when initially published?",
    },
  ],
  "wiki-film": [
    {
      verbatim:
        'It is loosely based on [person=Philip K. Dick]\'s novel [title="Do Androids Dream of Electric Sheep?"] ([year=1968]).',
      questions: "What book is it based on? When was that book published?",
    },
    {
      verbatim:
        "The film is set in a dystopian future [city=Los Angeles] of [year=2019], in which [synthetic humans known as replicants are bio-engineered by the powerful Tyrell Corporation to work on off-world colonies].",
      questions:
        "When and where is the film set? Is it a utopian or dystopian future? What characterizes the setting?",
    },
    {
      verbatim:
        '"[title=Blade Runner]" initially underperformed in [country=North American] theaters and polarized critics; some praised its [thematic complexity and visuals], while others were displeased with its [slow pacing and lack of action].',
      questions:
        "How did it initially perform? How did critics react? What aspects did critics praise? What aspects did critics condemn?",
    },
    {
      verbatim:
        "It later became an acclaimed cult film regarded as one of the all-time best [genre=science fiction] films.",
      questions:
        "How is it thought of now? How does it rank compared with other films of its genre?",
    },
    {
      verbatim:
        'Hailed for its production design depicting [a "retrofitted" future], "[title=Blade Runner]" is a leading example of [neo-noir cinema].',
      questions:
        "What genre does it exemplify? What aspects make it a good example?",
    },
    {
      verbatim:
        "The soundtrack, composed by [artist=Vangelis], was nominated in [year=1983] for a [award=BAFTA and a Golden Globe] as [best original score].",
      questions:
        "Who composed the soundtrack? Was it nominated for any awards?",
    },
    {
      verbatim:
        "The film has influenced many [genre=science fiction] films, [video games, anime, and television series].",
      questions: "What other works of art has it influenced?",
    },
    {
      verbatim:
        "It brought the work of [author=Philip K. Dick] to the attention of Hollywood, and several later big-budget films were based on his work.",
      questions:
        "What effect did the film have on the careers of people involved in its production?",
    },
    {
      verbatim:
        'In the year after its release, "[title=Blade Runner]" won the [award=Hugo Award for Best Dramatic Presentation], and in [year=1993] it was selected for preservation in the [U. S. National Film Registry by the Library of Congress] as being "[culturally, historically, or aesthetically significant]".',
      questions:
        "What awards did it win? When? Was it selected for preservation?",
    },
    {
      verbatim:
        'A sequel, "[title=Blade Runner 2049]", was released in [month=October] [year=2017].',
      questions: "Was a sequel made? What was its title? When was it released?",
    },
    {
      verbatim:
        '[Seven] versions of "[title=Blade Runner]" exist as a result of [controversial changes requested by studio executives].',
      questions:
        "Do multiple versions exist? What led to there being multiple versions?",
    },
    {
      verbatim:
        "A director's cut was released in [year=1992] after a [strong response to test screenings of a workprint].",
      questions: "Was a director's cut released? When? Why?",
    },
    {
      verbatim:
        "[This, in conjunction with the film's] popularity as a video rental, [made it one of the earliest movies to be] released on DVD.",
      questions:
        "Was it released on DVD? Was its release noteworthy? Why? Was it popular as a rental?",
    },
    {
      verbatim:
        'In [year=2007], [org=Warner Bros.] released "[title=The Final Cut]", a [25th-anniversary] digitally remastered version; [the only version over which Scott retained artistic control].',
      questions: "Was a remastered version released? When? By whom?",
    },
  ],
  travelGuide: [
    {
      verbatim:
        "Compared to other [nationality=American] cities, relatively few residents are home-town natives, rather than transplants from elsewhere.",
      questions:
        "How many residents are natives vs transplants? How does this compare with other cities in the same country?",
    },
    {
      verbatim:
        "[city=D.C., and particularly the metro area beyond the city limits,] is impressively international.",
      questions: "Is the population diverse?",
    },
    {
      verbatim:
        "The most beautiful time of spring usually falls from [April] to [mid-May].",
      questions: "When is springtime the best?",
    },
    {
      verbatim:
        "[Weekends and federal holidays] are more accommodating to guests as there are [less parking restrictions].",
      questions: "What days of the week or month are best to visit? Why?",
    },
    {
      verbatim:
        "[Metrorail] fares depend on the distance traveled and whether the trip starts during a peak or off-peak time period.",
      questions:
        "How expensive are transit fares? Do they depend on the destination or the time of day?",
    },
    {
      verbatim:
        "You must board though the [front] door so [ridership can be tracked].",
      questions: "What are some rules for riding transit?",
    },
    {
      verbatim:
        "Driving in downtown [D.C.] is difficult, particularly during rush hour, where traffic can make it take [10 minutes to drive a couple city blocks].",
      questions: "Is driving downtown difficult? When is it worst?",
    },
    {
      verbatim:
        "There are several other parks worth visiting, including the [Kenilworth Aquatic Gardens in Anacostia, the National Arboretum in Near Northeast, Meridian Hill Park in Columbia Heights, and the C&O Canal Towpath in Georgetown].",
      questions: "What parks are worth visiting?",
    },
    {
      verbatim:
        "The team also plays at [the Capital One Arena] since [the crowds for the Hoyas' games are too big for the University to hold].",
      questions: "What sports teams are there? Where do they play?",
    },
    {
      verbatim:
        "The gift shops of [the Smithsonian museums] have unique but more expensive offerings and are great places to buy gifts.",
      questions: "Where are good places to buy gifts? How expensive are they?",
    },
    {
      verbatim:
        "[Busboys and Poets], a local chain, is known for hosting [social-justice focused] events.",
      questions:
        "What kinds of events might be interesting? What kinds of places host them?",
    },
    {
      verbatim: "[The Villain & Saint] hosts local [jazz and rock] bands.",
      questions: "Where do local bands play? What genres are they?",
    },
    {
      verbatim:
        "Free WiFi is also available at [metro stations,  D.C. public libraries,] and many local coffee shops, which are also nice places to relax.",
      questions: "Where can you get free WiFi? Are local coffee shops nice?",
    },
    {
      verbatim:
        "Each [month=May], dozens of [org=embassies] open their doors to the public for the [Passport D.C.] festival, which showcases [the buildings themselves, as well as exhibits, talks, and performances].",
      questions:
        "Are there notable yearly festivals? What are some unique things that happen during those festivals?",
    },
  ],
};

const nFullCue = 10;

export class TrialState {
  constructor(flags) {
    this.flags = flags;
    extendObservable(this, {
      curText: "",
    });
  }

  handleEvent(event) {
    let sideEffects = [];
    if (event.type === "setText") {
      this.curText = event.text;
    }

    return sideEffects;
  }

  getSerialized() {
    return {
      curText: this.curText,
    };
  }
}

decorate(TrialState, {
  handleEvent: action.bound,
});

const WelcomeScreen = { screen: "Welcome", view: Views.Welcome };
const DoneScreen = { screen: "Done", view: Views.Done };

const getTasksAndConditions = (prompts, conditionNames) => {
  let tasksAndConditions = [];
  let botIdx = 1;
  for (let idx = 0; idx < prompts.length; idx++) {
    let prompt = prompts[idx];
    let conditionName = conditionNames[idx];
    let task = getTask(prompts[idx]);
    tasksAndConditions.push({
      conditionName,
      prompt,
      task,
      botIdx: conditionName === "noprompt" ? null : botIdx++,
    });
  }
  return tasksAndConditions;
};

function getScreens(tasksAndConditions, isDemo) {
  return [
    WelcomeScreen,
    // getIntroSurvey(tasksAndConditions),
    {
      screen: "ScenarioDesc",
      view: () => (
        <div className="Survey">
          <h1>Consider this imaginary scenario...</h1>
          <p>
            Oh no! A bunch of Wikipedia articles were found to contain content
            under the wrong license. The editors decided that the only way to
            make things right was to delete and rewrite them without looking at
            the existing articles at all.
          </p>
          <p>
            Since there were so many articles to rewrite, some editors made bots
            to help. The bots make suggestions about what to include in a new
            article based on the text of other articles.
          </p>
          <p>
            Today we are testing 2 different bots. Each bot presents its
            suggestions in a different way. None of them are perfect yet, but
            the editors want to find out which bot is most promising.
          </p>

          <p>
            You can help by trying out writing with suggestions from the two
            different bots. To help see whether the bots are helpful overall,
            you'll also do some writing without any bot.
          </p>
          <NextBtn />
        </div>
      ),
    },
    getPrecommitScreen(tasksAndConditions),
    ...getExperimentBlocks(tasksAndConditions),
    getClosingSurvey(tasksAndConditions),
    DoneScreen,
  ];
}

function getTask(promptName) {
  if (promptName === "travelGuide") {
    const nameField = "destination-name";

    return {
      flags: {
        domain: "wikivoyage",
      },
      writingType: {
        singular: "travel guide",
        plural: "travel guides",
      },
      categoryQuestion: {
        text: "The main attraction of this destination is:",
        options: ["nature", "culture", "other"],
      },

      visibleName: "travel destination", // (city, region, national park, etc.)
      visibleNameLong:
        "place you might travel to, such as a particular city, country, or natural area",
      nameField,
      topicName: <ControlledInputView name={nameField} />,

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

    const categoryQuestionMap = {
      book: {
        text: "This book would be classified as:",
        options: ["fiction", "non-fiction", "other"],
      },
      film: {
        text: "This film would be classified as:",
        options: ["drama", "musical or comedy", "animated", "other"],
      },
    };

    return {
      flags: {
        domain: promptName,
      },
      categoryQuestion: categoryQuestionMap[topicNameCode],
      visibleName,
      visibleNameLong: visibleName,
      writingType: {
        singular: `an encyclopedia-style article about a ${visibleName}`,
        plural: `encyclopedia-style articles`,
      },
      nameField,
      topicName: <ControlledInputView name={nameField} />,

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

const cueView = (condition, cue) => {
  let txt = condition === "questions" ? cue["questions"] : cue["verbatim"];
  let result = [];
  let regex = /\[(\w+=)?([^\]]+)\]/;
  let match;
  let i = 0;
  while ((match = txt.match(regex))) {
    result.push(txt.slice(0, match.index));
    if (condition === "template" || condition === "labeled") {
      result.push(
        <span key={i++} style={{ opacity: 0.25 }}>
          {match[2]}
        </span>
      );
    } else {
      result.push(match[2]);
    }
    txt = txt.slice(match.index + match[0].length);
  }
  if (txt) result.push(txt);
  return result;
};

const getExperimentBlocks = tasksAndConditions => {
  const getBaselineTrialScreen = (
    blockIdx,
    trialIdx,
    total,
    task,
    prompt,
    conditionName
  ) => ({
    preEvent: {
      type: "logCue",
      blockIdx,
      trialIdx,
      cue: "",
      prompt,
      conditionName,
    },
    screen: "Trial",
    view: iobs(({ state }) => {
      return (
        <div className="Survey">
          <h1>
            Sentence {trialIdx + 1} of {total}
          </h1>

          <div>
            Write a sentence or two that would belong in an encyclopedia article
            about <b>{task.topicName}</b>.
          </div>
          <div style={{ padding: "10px 30px" }}>
            <ControlledInput
              name={`response-${blockIdx}-${trialIdx}`}
              multiline={true}
              rows={3}
              style={{ width: "100%" }}
            />
          </div>
          <br />
          <NextBtn enabledFn={state => true} />
        </div>
      );
    }),
  });

  const getTrialScreen = (
    blockIdx,
    trialIdx,
    cue,
    total,
    task,
    prompt,
    conditionName
  ) => ({
    preEvent: {
      type: "logCue",
      blockIdx,
      trialIdx,
      cue,
      prompt,
      conditionName,
    },
    screen: "Trial",
    view: iobs(({ state }) => {
      const relevanceName = `relevance-${blockIdx}-${trialIdx}`;
      const responseName = `response-${blockIdx}-${trialIdx}`;
      return (
        <div className="Survey">
          <h1>
            Sentence {trialIdx + 1} of {total}
          </h1>

          <div>Bot's prompt:</div>
          <div
            style={{
              padding: "10px 20px",
              margin: "10px 0",
              background: "#eee",
              borderRadius: "3px",
            }}
          >
            {cueView(conditionName, cue)}
          </div>

          <p>
            Does this prompt give you any ideas about what to write for an
            article about "<b>{task.topicName}</b>"?
          </p>
          <OptionsResponse
            name={relevanceName}
            question={{
              options: ["No", "Yes"],
            }}
          />

          {state.controlledInputs.get(relevanceName) === "Yes" && (
            <div>
              <div style={{ marginTop: "15px" }}>
                Based on this prompt, write a sentence or two that would belong
                in an encyclopedia article about <b>{task.topicName}</b>.
                Remember that the reader of the article{" "}
                <b>won't see the prompt</b>.
              </div>
              <div style={{ padding: "10px 0" }}>
                <ControlledInput
                  name={responseName}
                  multiline={true}
                  rows={3}
                  style={{ width: "100%" }}
                />
              </div>
            </div>
          )}
          <br />
          <NextBtn
            enabledFn={state =>
              state.controlledInputs.get(relevanceName) !== undefined &&
              (state.controlledInputs.get(relevanceName) !== "Yes" ||
                state.controlledInputs.get(responseName) !== undefined)
            }
          />
        </div>
      );
    }),
  });

  const getExperimentBlock = (
    task,
    prompt,
    condition,
    blockIdx,
    totalBlocks,
    botIdx
  ) => [
    {
      screen: "Instructions",
      view: () => (
        <div className="Survey">
          <h1>
            Article {blockIdx + 1} of {totalBlocks}
          </h1>
          <p>
            <b>Your task</b>: Write sentences that might get included in an
            encyclopedia article about the {task.visibleName} you listed,{" "}
            <b>{task.topicName}</b>.
          </p>
          {condition === "noprompt" ? (
            <div>
              <p>
                For this article, you'll be writing without any bot prompt. Just
                write {nFullCue} sentences, one at a time.
              </p>
              <ul style={{ lineHeight: 1.5 }}>
                <li>
                  You may write sentences in a different order than they would
                  appear in the article, so don't worry if you want to write
                  something that doesn't flow nicely from the previous sentence
                  you wrote.
                </li>
                <li>
                  <b>
                    Don't worry about whether the information you provide is
                    accurate
                  </b>
                  . If you need some specific information for the sentence you
                  want to write, invent something plausible.
                </li>
              </ul>
            </div>
          ) : (
            <div>
              <p>For this article, you’ll be using Bot {botIdx}.</p>
              <ul style={{ lineHeight: 1.5 }}>
                <li>
                  The bot will give a prompt. Write a sentence or two based on
                  that prompt. <b>The reader won't see the prompt.</b>
                </li>
                <li>
                  You may write sentences in a different order than they would
                  appear in the article, so don't worry if you want to write
                  something that doesn't flow nicely from the previous sentence
                  you wrote.
                </li>
                <li>
                  If the bot's prompt doesn't give you a clear idea of what to
                  write, say so and move on.
                </li>
                <li>
                  Since we're just trying out these bots,{" "}
                  <b>
                    don't worry about whether the information you provide is
                    accurate
                  </b>
                  . If you need some specific information for the sentence you
                  want to write, invent something plausible.
                </li>
              </ul>
            </div>
          )}
          <NextBtn />
        </div>
      ),
    },
    ...cuesByPrompt[prompt]
      .slice(0, nFullCue)
      .map((cue, trialIdx) =>
        condition !== "noprompt"
          ? getTrialScreen(
              blockIdx,
              trialIdx,
              cue,
              nFullCue,
              task,
              prompt,
              condition
            )
          : getBaselineTrialScreen(
              blockIdx,
              trialIdx,
              nFullCue,
              task,
              prompt,
              condition
            )
      ),
    {
      screen: "PostBlockSurvey",
      view: surveyView({
        title: `Survey for Article ${blockIdx + 1} of ${totalBlocks}`,
        basename: `postBlock-${blockIdx}`,
        questions: [
          agreeLikert("fluent", "I felt like I could write easily."),
          agreeLikert("stuck", "I sometimes felt stuck."),
          ...(condition === "noprompt"
            ? []
            : [
                agreeLikert(
                  "sysUnderstandable",
                  "I could understand the bot's suggestions."
                ),
                agreeLikert(
                  "sysRelevant",
                  "The bot's suggestions were relevant."
                ),
              ]),
          {
            text:
              "I used outside resources for this task (we'd prefer you didn't, but better to be honest).",
            name: "used-external",
            responseType: "options",
            options: ["Yes", "No"],
          },
          SurveyData.techDiff,
          SurveyData.otherMid,
        ],
      }),
    },
  ];
  return flatMap(
    tasksAndConditions,
    ({ task, prompt, conditionName, botIdx }, idx) =>
      getExperimentBlock(
        task,
        prompt,
        conditionName,
        idx,
        tasksAndConditions.length,
        botIdx
      )
  );
};

function getAllWritings(state) {
  let res = [];
  for (let blockIdx = 0; blockIdx < 3; blockIdx++) {
    let block = [];
    res.push(block);
    for (let trialIdx = 0; trialIdx < 10; trialIdx++) {
      let name = `response-${blockIdx}-${trialIdx}`;
      let text = state.controlledInputs.get(name);
      if (text) {
        block.push({
          trialIdx,
          text,
        });
      }
    }
  }
  return res;
}

function getClosingSurvey(tasksAndConditions) {
  let botCodes = [];
  tasksAndConditions.forEach(({ botIdx, conditionName }) => {
    if (botIdx !== null)
      botCodes.push({ key: conditionName, value: `Bot ${botIdx}` });
  });
  const comparisonRank = (attr, text) => ({
    text,
    responseType: "options",
    name: `comparisonRank-${attr}`,
    options: botCodes,
  });
  return {
    screen: "PostExpSurvey",
    view: iobs(({ state }) => {
      const basename = "postExp";
      const questions = [
        {
          type: "text",
          text: (
            <h3>
              How appropriate is the content and style of each of these
              sentences?
            </h3>
          ),
        },
        ...flatMap(getAllWritings(state), (blockResponses, blockIdx) => [
          ...blockResponses.map(({ text, trialIdx }) =>
            likert(
              `quality-${blockIdx}-${trialIdx}`,
              `Encyclopedia article about ${state.controlledInputs.get(
                tasksAndConditions[blockIdx].task.nameField
              )}: "${text}"`,
              5,
              ["Very unsatisfied", "Very satisfied"]
            )
          ),
        ]),
        {
          type: "text",
          text: (
            <div>
              <b>Now let's compare the bots.</b> For reference, here's a sample
              of what each of the bots suggested:
              <div>
                {tasksAndConditions.map(({ prompt, conditionName, botIdx }) =>
                  botIdx !== null ? (
                    <div key={botIdx}>
                      <h3>Bot {botIdx}</h3>
                      <ul>
                        {cuesByPrompt[prompt]
                          .slice(0, 3)
                          .map((cue, trialIdx) => (
                            <li key={trialIdx} style={{ paddingBottom: "5px" }}>
                              {cueView(conditionName, cue)}
                            </li>
                          ))}
                      </ul>
                    </div>
                  ) : null
                )}
              </div>
            </div>
          ),
        },
        comparisonRank(
          "understand-most",
          "Which bot was easiest to understand?"
        ),
        // comparisonRank(
        //   "understand-least",
        //   "Which bot was hardest to understand?"
        // ),
        comparisonRank("generate-most", "Which bot made it easiest to write?"),
        // comparisonRank("generate-least", "Which bot made it hardest to write?"),
        comparisonRank(
          "choice-most",
          "If you were writing an article on a new topic, which bot would you most like to have?"
        ),
        // comparisonRank(
        //   "choice-least",
        //   "If you were writing an article on a new topic, which bot would you least like to have?"
        // ),
        SurveyData.age,
        SurveyData.gender,
        SurveyData.english_proficiency,
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
      ];
      return (
        <div className="Survey">
          <h1>Final Survey</h1>

          {surveyBody(basename, questions)}
          <NextBtn enabledFn={allQuestionsAnswered(basename, questions)} />
        </div>
      );
    }),
  };
}

const getFinalData = state => {
  let {
    tasksAndConditions,
    controlledInputs,
    ciStartTimes,
    ciEndTimes,
  } = state;
  let blocks = tasksAndConditions.map(
    ({ prompt, task, conditionName }, blockIdx) => {
      let trials = [];
      for (let trialIdx = 0; trialIdx < nFullCue; trialIdx++) {
        const relevanceName = `relevance-${blockIdx}-${trialIdx}`;
        const responseName = `response-${blockIdx}-${trialIdx}`;

        trials.push({
          relevance: controlledInputs.get(relevanceName),
          secsBeforeFirstJudgedRelevance: ciStartTimes.get(relevanceName),
          secsBeforeLastJudgedRelevance: ciEndTimes.get(relevanceName),
          text: controlledInputs.get(responseName),
          secsBeforeStartTyping: ciStartTimes.get(responseName),
          secsBeforeEndTyping: ciEndTimes.get(responseName),
          selfReportQuality: controlledInputs.get(
            `postExp-quality-${blockIdx}-${trialIdx}`
          ),
        });
      }

      let blockSurvey = [
        "fluent",
        "stuck",
        "sysUnderstandable",
        "sysRelevant",
        "used-external",
        "techDiff",
        "other",
      ].map(attr => [
        attr,
        controlledInputs.get(`postBlock-${blockIdx}-${attr}`),
      ]);

      return {
        blockIdx,
        prompt,
        conditionName,
        trials,
        blockSurvey,
        confidence: controlledInputs.get(`confidence-${task.nameField}`),
        category: controlledInputs.get(`category-${task.nameField}`),
      };
    }
  );
  return {
    conditionOrder: tasksAndConditions.map(
      ({ conditionName }) => conditionName
    ),
    promptOrder: tasksAndConditions.map(({ prompt }) => prompt),
    blocks,
    screenTimes: state.screenTimes.map(screen => ({
      ...screen,
      name: state.screens[screen.num].screen,
    })),
    controlledInputs: [...state.controlledInputs.toJS()],
  };
};
window.getFinalData = getFinalData;

export function createTaskState(loginEvent: LoginEvent) {
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
    prompts = ["wiki-film", "wiki-book", "travelGuide"];
  }

  // Get task setup.
  let tasksAndConditions = getTasksAndConditions(prompts, conditions);
  let screens = getScreens(tasksAndConditions, isDemo);

  let state = createState({
    clientId,
    screens,
    createExperimentState: flags => new TrialState(flags),
    timeEstimate: "30 minutes",
  });
  state.tasksAndConditions = tasksAndConditions;
  finalDataLogger(state, getFinalData);

  return state;
}

const getPrecommitScreen = tasksAndConditions => {
  let confidenceQuestions = tasksAndConditions.map(({ task }) =>
    likert(
      `confidence-${task.nameField}`,
      `How knowledgeable do you feel about this ${task.visibleName}?`,
      5,
      ["Passing Knowledge", "Encyclopedic Knowledge"]
    )
  );

  let requiredInputs = [
    ...tasksAndConditions.map(({ task }) => task.nameField),
    ...confidenceQuestions.map(({ name }) => name),
  ];

  return {
    screen: "Precommit",
    view: () => (
      <div className="Survey">
        <h1>Pick what to write about</h1>
        <div>
          {tasksAndConditions.map(({ task }, idx) => (
            <div key={idx} style={{ borderBottom: "1px solid black" }}>
              <p>
                Name a <b>{task.visibleNameLong}</b> that you know well.
              </p>
              <div
                style={{
                  padding: "12px",
                  lineHeight: 1.5,
                }}
              >
                <div>
                  Name of {task.visibleName}:{" "}
                  <ControlledInput name={task.nameField} />
                </div>
                <div>
                  {task.categoryQuestion.text}
                  <OptionsResponse
                    name={`category-${task.nameField}`}
                    question={task.categoryQuestion}
                  />
                </div>
                <div>
                  {confidenceQuestions[idx].text}
                  <LikertResponse
                    name={confidenceQuestions[idx].name}
                    question={confidenceQuestions[idx]}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>

        <NextBtn
          enabledFn={state =>
            requiredInputs.every(
              name => state.controlledInputs.get(name) !== undefined
            )
          }
        />
      </div>
    ),
  };
};
