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

let baseConditions = ["noprompt", "template", "questions"];
let conditionOrders = shuffle.permutator(baseConditions);

const cuesByPrompt = {
  "wiki-book": [
    {
      verbatim:
        'Sir Gawain and the Green Knight (Middle English: "Sir Gawayn and \u00fee Grene Kny\u021dt") is a late 14th-century Middle English chivalric romance.',
      template: "[title] ([language]: [title]) is a [date] [language] [genre].",
      questions:
        "What is title? What was title in original language? When published? What genre?",
    },
    {
      verbatim:
        "It is one of the best known Arthurian stories, with its plot combining two types of folklore motifs, the beheading game and the exchange of winnings.",
      template:
        "It is one of the best known [type], with its plot combining two types of [...], the [...] and the [...].",
      questions:
        "What type of story is it? How well-known is it? What are some of its major plot characteristics?",
    },
    {
      verbatim:
        "It is written in stanzas of alliterative verse, each of which ends in a rhyming bob and wheel.",
      template: "It is written in stanzas of [...] verse, each of which [...].",
      questions:
        "What form are its stanzas? Does it rhyme? What is the rhyming pattern?",
    },
    {
      verbatim:
        "It draws on Welsh, Irish, and English stories, as well as the French chivalric tradition.",
      template:
        "It draws on [country], [country], and [country] stories, as well as the [...] tradition.",
      questions: "What are its major influences?",
    },
    {
      verbatim:
        "It is an important example of a chivalric romance, which typically involves a hero who goes on a quest which tests his prowess.",
      template:
        "It is an important example of a [genre], which typically involves [...].",
      questions:
        "What genre does it exemplify? What characteristizes that genre?",
    },
    {
      verbatim:
        "It remains popular to this day in modern English renderings from J. R. R. Tolkien, Simon Armitage, and others, as well as through film and stage adaptations.",
      template:
        "It remains popular to this day in modern [country] renderings from [person], [person], and others, as well as through film and stage adaptations.",
      questions: "Is it still popular? Does it have film or stage adaptations?",
    },
    {
      verbatim:
        'It describes how Sir Gawain, a knight of King Arthur\'s Round Table, accepts a challenge from a mysterious "Green Knight" who challenges any knight to strike him with his axe if he will take a return blow in a year and a day.',
      template: "It describes how [person], a [description], [...]",
      questions:
        "Who is the main character? What is their main attribute? What is the central plot element?",
    },
    {
      verbatim:
        'All are thought to have been written by the same unknown author, dubbed the "Pearl Poet" or "Gawain Poet", since all four are written in a North West Midland dialect of Middle English.',
      template:
        "All are thought to have been written by the same unknown author, dubbed [...], since all [...] are written in a [...] dialect of [language].",
      questions:
        "Do the other works in the manuscript share the same author? Why or why not?",
    },
    {
      verbatim:
        'The poem survives in a single manuscript, "Cotton Nero A.x.", which also includes three religious narrative poems: "Pearl", "Purity" and "Patience".',
      template:
        "[...] survives in a single manuscript, [name], which also includes [...]",
      questions:
        "How has the manuscript survived? Does the manuscript include other works?",
    },
  ],
  "wiki-film": [
    {
      template:
        'It is loosely based on [person=Philip K. Dick]\'s novel [title="Do Androids Dream of Electric Sheep?"] ([year=1968]).',
      questions: "What book is it based on? When was that book published?",
    },
    {
      template:
        "The film is set in a dystopian future [city=Los Angeles] of [year=2019], in which [synthetic humans known as replicants are bio-engineered by the powerful Tyrell Corporation to work on off-world colonies].",
      questions:
        "When and where is the film set? Is it a utopian or dystopian future? What characterizes the setting?",
    },
    {
      template:
        '"[title=Blade Runner]" initially underperformed in [country=North American] theaters and polarized critics; some praised its [thematic complexity and visuals], while others were displeased with its [slow pacing and lack of action].',
      questions:
        "How did it initially perform? How did critics react? What aspects did critics praise? What aspects did critics condemn?",
    },
    {
      template:
        "It later became an acclaimed cult film regarded as one of the all-time best [genre=science fiction] films.",
      questions:
        "How is it thought of now? How does it rank compared with other films of its genre?",
    },
    {
      template:
        'Hailed for its production design depicting [a "retrofitted" future], "[title=Blade Runner]" is a leading example of [neo-noir cinema].',
      questions:
        "What genre does it exemplify? What aspects make it a good example?",
    },
    {
      template:
        "The soundtrack, composed by [artist=Vangelis], was nominated in [year=1983] for a [award=BAFTA and a Golden Globe] as [best original score].",
      questions:
        "Who composed the soundtrack? Was it nominated for any awards?",
    },
    {
      template:
        "The film has influenced many [genre=science fiction] films, [video games, anime, and television series].",
      questions: "What other works of art has it influenced?",
    },
    {
      template:
        "It brought the work of [author=Philip K. Dick] to the attention of Hollywood, and several later big-budget films were based on his work.",
      questions:
        "What effect did the film have on the careers of people involved in its production?",
    },
    {
      template:
        'In the year after its release, "[title=Blade Runner]" won the [award=Hugo Award for Best Dramatic Presentation], and in [year=1993] it was selected for preservation in the [U. S. National Film Registry by the Library of Congress] as being "[culturally, historically, or aesthetically significant]".',
      questions:
        "What awards did it win? When? Was it selected for preservation?",
    },
    {
      template:
        'A sequel, "[title=Blade Runner 2049]", was released in [month=October] [year=2017].',
      questions: "Was a sequel made? What was its title? When was it released?",
    },
    {
      template:
        '[Seven] versions of "[title=Blade Runner]" exist as a result of [controversial changes requested by studio executives].',
      questions:
        "Do multiple versions exist? What led to there being multiple versions?",
    },
    {
      template:
        "A director's cut was released in [year=1992] after a [strong response to test screenings of a workprint].",
      questions: "Was a director's cut released? When? Why?",
    },
    {
      template:
        "[This, in conjunction with the film's] popularity as a video rental, [made it one of the earliest movies to be] released on DVD.",
      questions:
        "Was it released on DVD? Was its release noteworthy? Why? Was it popular as a rental?",
    },
    {
      template:
        'In [year=2007], [org=Warner Bros.] released "[title=The Final Cut]", a [25th-anniversary] digitally remastered version; [the only version over which Scott retained artistic control].',
      questions: "Was a remastered version released? When? By whom?",
    },
  ],
  travelGuide: [
    {
      verbatim:
        "Compared to other American cities, relatively few residents are home-town natives, rather than transplants from elsewhere.",
      template:
        "Compared to other [nationality] cities, relatively few residents are home-town natives, rather than transplants from elsewhere.",
      questions:
        "How many residents are natives vs transplants? How does this compare with other cities in the same country?",
    },
    {
      verbatim:
        "D.C., and particularly the metro area beyond the city limits, is impressively international.",
      template: "[city] is impressively international.",
      questions: "Is the population diverse?",
    },
    {
      verbatim:
        "The most beautiful time of spring usually falls from April to mid-May.",
      template:
        "The most beautiful time of spring usually falls from [...] to [...].",
      questions: "When is springtime the best?",
    },
    {
      verbatim:
        "Weekends and federal holidays are more accommodating to guests as there are less parking restrictions.",
      template:
        "Weekends and [...] holidays are more accommodating to guests as there are [...]",
      questions: "What days of the week or month are best to visit? Why?",
    },
    {
      verbatim:
        "Metrorail fares depend on the distance traveled and whether the trip starts during a peak or off-peak time period.",
      template:
        "[...] fares depend on the distance traveled and whether the trip starts during a peak or off-peak time period.",
      questions:
        "How expensive are transit fares? Do they depend on the destination or the time of day?",
    },
    {
      verbatim:
        "You must board though the front door so ridership can be tracked.",
      template: "You must board though the [...] door so that [...].",
      questions: "What are some rules for riding transit?",
    },
    {
      verbatim:
        "Driving in downtown D.C. is difficult, particularly during rush hour, where traffic can make it take 10 minutes to drive a couple city blocks.",
      template:
        "Driving in downtown [...] is difficult, particularly during rush hour, where traffic can make it take [...]",
      questions: "Is driving downtown difficult? When is it worst?",
    },
    {
      verbatim:
        "There are several other parks worth visiting, including the Kenilworth Aquatic Gardens in Anacostia, the National Arboretum in Near Northeast, Meridian Hill Park in Columbia Heights, and the C&O Canal Towpath in Georgetown.",
      template: "There are several other parks worth visiting, including [...]",
      questions: "What parks are worth visiting?",
    },
    {
      verbatim:
        "The team also plays at the Capital One Arena since the crowds for the Hoyas' games are too big for the University to hold.",
      template: "The team also plays at [...] since [...]",
      questions: "What sports teams are there? Where do they play?",
    },
    {
      verbatim:
        "The gift shops of the Smithsonian museums have unique but more expensive offerings and are great places to buy gifts.",
      template:
        "The gift shops of [...] have unique but more expensive offerings and are great places to buy gifts.",
      questions: "Where are good places to buy gifts? How expensive are they?",
    },
    {
      verbatim:
        "Busboys and Poets, a local chain, is known for hosting social-justice focused events.",
      template: "[...] is known for hosting [...] events.",
      questions:
        "What kinds of events might be interesting? What kinds of places host them?",
    },
    {
      verbatim: "The Villain & Saint hosts local jazz and rock bands.",
      template: "[place] hosts local [genre] bands.",
      questions: "Where do local bands play? What genres are they?",
    },
    {
      verbatim:
        "Free WiFi is also available at metro stations,  D.C. public libraries, and many local coffee shops, which are also nice places to relax.",
      template:
        "Free WiFi is also available at [...] and many local coffee shops, which are also nice places to relax.",
      questions: "Where can you get free WiFi? Are local coffee shops nice?",
    },
    {
      verbatim:
        "Each May, dozens of embassies open their doors to the public for the  Passport D.C. festival, which showcases the buildings themselves, as well as exhibits, talks, and performances.",
      template:
        "Each [month], dozens of [org] open their doors to the public for the [...] festival, which showcases [...]",
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

function getScreens(prompts, conditionNames, isDemo) {
  let tasksAndConditions = prompts.map((conditionName, idx) => ({
    conditionName: conditionNames[idx],
    prompt: prompts[idx],
    task: getTask(prompts[idx]),
  }));
  //   if (isDemo) return getPrewritingScreens(tasksAndConditions);
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
            under the wrong license. The editors decided that the only option to
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
            the editors want to find out which bot is most promising. To help
            see whether the bots are helpful overall, you'll also do some
            writing without any bot.
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
        text: "This book is:",
        options: ["fiction", "non-fiction", "other"],
      },
      film: {
        text: "This film is a:",
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

const cueView = txt => {
  let result = [];
  let regex = /\[(\w+=)?([^\]]+)\]/;
  let match;
  let i = 0;
  while ((match = txt.match(regex))) {
    result.push(txt.slice(0, match.index));
    result.push(
      <span key={i++} style={{ opacity: 0.25 }}>
        {match[2]}
      </span>
    );
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
            Write a sentence or two for the article about{" "}
            <b>{task.topicName}</b>.
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
            {cueView(cue)}
          </div>

          <p>
            Does this prompt give you any ideas about what to write for an
            article about "<b>{task.topicName}</b>"?
          </p>
          <OptionsResponse
            name={relevanceName}
            question={{
              options: [
                "No, it doesn't make sense.",
                "No, it's not relevant.",
                "Yes",
              ],
            }}
          />

          {state.controlledInputs.get(relevanceName) === "Yes" && (
            <div>
              <div style={{ marginTop: "15px" }}>
                Based on this prompt, write a sentence or two for the article
                about <b>{task.topicName}</b>. Remember that the reader of the
                article won't see the prompt.
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
    totalBlocks
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
            article about the {task.visibleName} you listed,{" "}
            <b>{task.topicName}</b>.
          </p>
          {condition === "noprompt" ? (
            <div>
              <p>
                For this article, you'll be writing without any bot prompt. Just
                write 10 sentences.
              </p>
              <ul style={{ lineHeight: 1.5 }}>
                <li>Order doesn’t matter.</li>
                <li>
                  <b>
                    Don't worry about whether the information you provide is
                    accurate
                  </b>
                  . If you need some specific information for the sentence you
                  want to write, invent something plausible.
                </li>
                <li>The reader won't see the prompt.</li>
              </ul>
            </div>
          ) : (
            <div>
              <p>For this article, you’ll be using Bot {blockIdx + 1}.</p>
              <ul style={{ lineHeight: 1.5 }}>
                <li>
                  The bot will give a prompt. Write a sentence or two based on
                  that prompt.
                </li>
                <li>
                  If the bot's prompt is irrelevant or hard to understand, say
                  so and move on.
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
              cue[condition],
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
        title: `Survey for Bot ${blockIdx + 1} of ${totalBlocks}`,
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
  return flatMap(tasksAndConditions, ({ task, prompt, conditionName }, idx) =>
    getExperimentBlock(
      task,
      prompt,
      conditionName,
      idx,
      tasksAndConditions.length
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

const comparisonRank = (attr, text) => ({
  text,
  responseType: "options",
  name: `comparisonRank-${attr}`,
  options: ["Bot 1", "Bot 2", "Bot 3"],
});

function getClosingSurvey(tasksAndConditions) {
  return {
    screen: "PostExpSurvey",
    view: iobs(({ state }) => {
      const basename = "postExp";
      const questions = [
        {
          type: "text",
          text: (
            <h3>
              How satisfied are you with having written each of these sentences?
            </h3>
          ),
        },
        ...flatMap(getAllWritings(state), (blockResponses, blockIdx) => [
          // {
          //   type: "text",
          //   text: (
          //     <div>
          //       What you wrote for {tasksAndConditions[blockIdx].task.topicName}
          //     </div>
          //   ),
          // },
          ...blockResponses.map(({ text, trialIdx }) =>
            likert(`quality-${blockIdx}-${trialIdx}`, `"${text}"`, 5, [
              "Very unsatisfied",
              "Very satisfied",
            ])
          ),
        ]),
        {
          type: "text",
          text: (
            <div>
              <b>Now let's compare the bots.</b> For reference, here's a sample
              of what each of the bots suggested:
              <div>
                {tasksAndConditions.map(
                  ({ prompt, conditionName }, blockIdx) => (
                    <div key={blockIdx}>
                      <h3>Bot {blockIdx + 1}</h3>
                      <ul>
                        {cuesByPrompt[prompt]
                          .slice(0, 3)
                          .map((cue, trialIdx) => (
                            <li key={trialIdx} style={{ paddingBottom: "5px" }}>
                              {cue[conditionName]}
                            </li>
                          ))}
                      </ul>
                    </div>
                  )
                )}
              </div>
            </div>
          ),
        },
        comparisonRank(
          "understand-most",
          "Which bot was easiest to understand?"
        ),
        comparisonRank(
          "understand-least",
          "Which bot was hardest to understand?"
        ),
        comparisonRank("generate-most", "Which bot made it easiest to write?"),
        comparisonRank("generate-least", "Which bot made it hardest to write?"),
        comparisonRank(
          "choice-most",
          "If you were writing an article on a new topic, which bot would you most like to have?"
        ),
        comparisonRank(
          "choice-least",
          "If you were writing an article on a new topic, which bot would you least like to have?"
        ),
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
