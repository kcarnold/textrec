/** @format */
import React, { Component } from "react";

let contexts = ["", "I came here last night with a friend."];
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
              <td>{ctx}</td>
              <td>
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
