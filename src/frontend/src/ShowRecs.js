/** @format */
import React, { Component } from "react";

let contexts = [
  "",
  "I came here last night with a friend.",
  "I've given the Clay Pit a few chances, because so many people love it, I think I must be wrong. But I'm just not feeling it.",
  "I felt like I am waiting for my food in the cafeteria, but it's a new experience to eat barbecues.",
  "I enjoyed West Egg.  The spot feels so hip and cool.",
];
let recs = {};

const getCue = context => {
  let requestBody = {
    method: "get_cue",
    recType: "phraseCue",
    domain: "restaurant",
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

const CuesView = ({ cues }) => {
  if (!cues) return "...";
  return (
    <div>
      {cues.cues.map((cue, i) => (
        <div key={i}>{cue.phrase}</div>
      ))}
    </div>
  );
};

class ShowRecs extends Component {
  constructor(props) {
    super(props);
    this.state = {
      recs: {},
    };
  }

  componentDidMount() {
    contexts.forEach(context => {
      getCue(context).then(data => {
        this.setState({ recs: { ...this.state.recs, [context]: data } });
      });
    });
  }

  render() {
    let { recs } = this.state;
    return (
      <table>
        <tbody>
          {contexts.map(ctx => (
            <tr key={ctx}>
              <td
                style={{ verticalAlign: "top", borderTop: "1px solid black" }}
              >
                {ctx}
              </td>
              <td
                style={{ verticalAlign: "top", borderTop: "1px solid black" }}
              >
                <CuesView cues={recs[ctx]} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }
}

export default ShowRecs;
