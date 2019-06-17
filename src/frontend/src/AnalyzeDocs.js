/** @format */
import React, { Component } from "react";
import { observable } from "mobx";
import { observer } from "mobx-react";

let docs = observable([
  {
    domain: "wiki-film",
    doc: `The Iron Giant is a 1999 American animated science fiction film produced by Warner Bros.
Feature Animation and directed by Brad Bird in his directorial debut, who would later script and direct the Pixar film The Incredibles (2004).
It is based on the 1968 novel The Iron Man by Ted Hughes (which was published in the United States as The Iron Giant) and was scripted by Tim McCanlies from a story treatment by Bird.
The film stars the voices of Eli Marienthal, Vin Diesel, Jennifer Aniston, Harry Connick Jr., Christopher McDonald and John Mahoney.
Set during the Cold War in 1957, the film is about a young boy named Hogarth Hughes, who discovers and befriends a gigantic metallic robot who fell from outer space.
With the help of a beatnik artist named Dean McCoppin, Hogarth attempts to prevent the U.S. military and Kent Mansley, a paranoid federal agent, from finding and destroying the Giant.

The film's development began in 1994 as a musical with the involvement of The Who's Pete Townshend, though the project took root once Bird signed on as director and hired McCanlies to write the screenplay in 1996.
The film was animated using traditional animation, with computer-generated imagery used to animate the titular character and other effects.
The understaffed crew of the film completed it with half of the time and budget of other animated features.
Michael Kamen composed the film's score, which was performed by the Czech Philharmonic.

The Iron Giant premiered at Mann's Chinese Theater in Los Angeles on July 31, 1999 and was released worldwide on August 6.
Upon release, the film significantly under-performed at the box office, grossing $31.3 million worldwide against a production budget of $70–80 million, which was blamed on Warner Bros.' unusually poor marketing campaign and skepticism towards animated film production following the failure of Quest for Camelot in the preceding year.
Despite this, the film received widespread critical acclaim with praise directed at the story, animation, characters, the portrayal of the title character and the voice performances of Aniston, Connick Jr., Diesel, McDonald, Mahoney and Marienthal.
The film was nominated for several awards, winning nine Annie Awards out of 15 nominations.
Through home video releases and television syndication, the film gathered a cult following and is now widely regarded as a modern animated classic.
In 2015, an extended, remastered version of the film was re-released theatrically, which saw a home video release the following year.
`,
    analysis: null,
  },
  {
    domain: "wiki-film",
    doc: `The Little Mermaid is a 1989 American animated musical romantic fantasy film produced by Walt Disney Feature Animation and Walt Disney Pictures.
The 28th Disney animated feature film, the film is loosely based on the Danish fairy tale of the same name by Hans Christian Andersen.
The film tells the story of a mermaid princess named Ariel who dreams of becoming human, after falling in love with a human prince named Eric.
Written and directed by Ron Clements and John Musker, with music by Alan Menken and Howard Ashman (who also served as co-producer alongside John Musker), and art direction by Michael Peraza Jr. and Donald A. Towns, the film features the voices of Jodi Benson, Christopher Daniel Barnes, Pat Carroll, Samuel E. Wright, Jason Marin, Kenneth Mars, Buddy Hackett, and René Auberjonois.

The Little Mermaid was released to theaters on November 17, 1989 to largely positive reviews, garnering $84 million at the domestic box office during its initial release, and $211 million in total lifetime gross worldwide.
After the success of the 1988 Disney/Amblin film Who Framed Roger Rabbit, The Little Mermaid is given credit for breathing life back into the art of Disney animated feature films after a string of critical or commercial failures produced by Disney that dated back to the early 1970s.
It also marked the start of the era known as the Disney Renaissance.
The film won two Academy Awards for Best Original Score and Best Original Song (“Under the Sea”).

A stage adaptation of the film with a book by Doug Wright and additional songs by Alan Menken and new lyricist Glenn Slater opened in Denver in July 2007 and began performances on Broadway January 10, 2008 starring Sierra Boggess.

In May 2016, Disney announced that a live-action adaptation is currently in development.`,
    analysis: null,
  },
]);
window.docs = docs;

const getAnalysis = (domain, doc) => {
  let requestBody = {
    method: "analyze_doc",
    domain,
    text: doc,
  };
  return fetch("/api", {
    headers: {
      "Content-Type": "application/json",
    },
    method: "POST",
    body: JSON.stringify(requestBody),
  }).then(response => response.json());
};

const AnalyzeDocs = observer(
  class AnalyzeDocs extends Component {
    componentDidMount() {
      docs.forEach(docObj => {
        let { domain, doc } = docObj;
        getAnalysis(domain, doc).then(data => {
          docObj.analysis = data;
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
          {docs.map(({ domain, doc, analysis }, i) => {
            if (analysis == null) {
              return doc;
            }
            return (
              <div
                key={i}
                style={{
                  maxWidth: "1000px",
                  margin: "0 auto",
                }}
              >
                <h1>{domain}</h1>
                <table>
                  <tbody>
                    {analysis.raw_sents.map((sent, sentIdx) => (
                      <tr key={sentIdx}>
                        <td
                          style={{
                            verticalAlign: "top",
                            borderTop: "1px solid black",
                            maxWidth: "400px",
                          }}
                        >
                          {sent}
                        </td>
                        <td
                          style={{
                            verticalAlign: "top",
                            borderTop: "1px solid black",
                          }}
                        >
                          {analysis.clusters[sentIdx].label}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          })}
        </div>
      );
    }
  }
);

export default AnalyzeDocs;
