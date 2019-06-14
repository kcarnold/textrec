/** @format */
import React, { Component } from "react";
import { observable } from "mobx";
import { observer } from "mobx-react";

let contexts = observable([
  {
    domain: "wiki-film",
    sents: [
      "The Lion King is a 1994 animated film from Walt Disney Studios.",
      "The movie features an original soundtrack by Elton John.",
      "There have been several sequels made and a live action remake has also been released.",
      "The film is fictional and the plot is loosely based on William Shakespeare's Hamlet.",
      "The plot of the movie follows a young lion named Simba and his father Mufasa, who is king of the jungle.",
      "Mufasa is killed by his evil brother, Scar and Scar blames his death on Simba.",
      "Devastated, Simba leaves the kingdom due to his guilt.",
      "Simba meets a warthog and meerkat named Pumba and Timon and they raise young Simba.",
      "Eventually, Simba meets an old friend who convinces him to return home.",
      "Simba fights Scar, beating him and taking his place as the rightful king.",
    ],
    cues: [],
  },
  {
    domain: "wiki-book",
    sents: [
      "1984 is a future world book made by George Orwell in 1949.",
      "The book was written about how in the future the government controls everyones actions.",
      "This is done started by the current leader, Emmanuel Goldstein.",
      "This world is surrounded by cameras and people who watch everything the citizens do.",
      "If they do not listen they are sent to the ministry of Love.",
      "This is really somewhere that people are killed who do not listen.",
      "While the name is odd, the government uses double speak which means the opposite of what it really means.",
      "The book revolves around Winston a factory worker and a 26 year old Julia who works in the ministry of truth.",
      "They both grow tired of their lives and want to leave the system.",
      "While it is thought impossible, they found a place that didnt have cameras.",
      "There they planned where to go.",
      "While in the last part of the plan, Julia has second thoughts and reports Winston to the police.",
      "He is taken to be re-educated",
      "then eventually is sent to the ministry of love.",
    ],
    cues: [],
  },
]);
window.contexts = contexts;

contexts.forEach(context => {
  context.sents.forEach((sent, idx) => {
    context.cues[idx] = null;
  });
});

const getCue = (domain, context) => {
  let requestBody = {
    method: "get_cue",
    recType: "highlightedSents",
    domain,
    text: context,
  };
  return fetch("/api", {
    headers: {
      "Content-Type": "application/json",
    },
    method: "POST",
    body: JSON.stringify(requestBody),
  }).then(response => response.json());
};

const CuesView = observer(({ cues }) => {
  if (!cues) return "...";
  return (
    <div>
      {cues.cues.map((cue, i) => (
        <div key={i}>{cue.label}</div>
      ))}
    </div>
  );
});

const LabeledSentenceView = observer(({ ctx, sentIdx }) => {
  let cues = ctx.cues[sentIdx];
  let existing_clusters = cues ? cues.existing_clusters : null;
  let lastSentLabel =
    (existing_clusters || []).length > 0
      ? existing_clusters[existing_clusters.length - 1]
      : null;
  let label = lastSentLabel ? lastSentLabel[1] : null;
  return (
    <div>
      {ctx.sents[sentIdx]}
      <br />
      <div
        style={{
          paddingTop: "5px",
        }}
      >
        <i>{label}</i>
      </div>
    </div>
  );
});

const ShowRecs = observer(
  class ShowRecs extends Component {
    componentDidMount() {
      contexts.forEach(context => {
        let { domain, sents } = context;
        sents.forEach((sent, idx) => {
          let text = sents.slice(0, idx + 1).join(" ");
          context.cues[idx] = null;
          getCue(domain, text).then(data => {
            context.cues[idx] = data;
            // console.log(text, data);
          });
        });
      });
    }

    render() {
      return (
        <div
          style={{
            margin: "0 auto",
            padding: "5px",
          }}
        >
          {contexts.map((ctx, i) => (
            <div
              key={i}
              style={{
                maxWidth: "1000px",
                margin: "0 auto",
              }}
            >
              <h1>{ctx.domain}</h1>
              <table>
                <tbody>
                  {ctx.sents.map((sent, sentIdx) => (
                    <tr key={sentIdx}>
                      <td
                        style={{
                          verticalAlign: "top",
                          borderTop: "1px solid black",
                          maxWidth: "400px",
                        }}
                      >
                        <LabeledSentenceView ctx={ctx} sentIdx={sentIdx} />
                      </td>
                      <td
                        style={{
                          verticalAlign: "top",
                          borderTop: "1px solid black",
                        }}
                      >
                        <CuesView cues={ctx.cues[sentIdx]} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      );
    }
  }
);

export default ShowRecs;
