import React from "react";
import { observer, inject } from "mobx-react";
import Consent from "./Consent";

const SITE_DOWN = false;


function advance(state, dispatch) {
  dispatch({ type: "next" });
}

export const NextBtn = inject("dispatch", "state")(
  observer(props => (
    <button
      className="NextBtn"
      onClick={() => {
        if (!props.confirm || window.confirm("Are you sure?")) {
          advance(props.state, props.dispatch);
        }
      }}
      disabled={props.disabled}
    >
      {props.children || "Next"}
    </button>
  ))
);

export const Welcome = inject("state")(
  observer(({ state }) => (
    <div>
      {SITE_DOWN && (
        <h1 style={{ paddingBottom: "2500px" }}>
          Site down for maintenance, please try again in a few hours.
        </h1>
      )}
      <h1>Welcome</h1>
      <p>
        You should be seeing this page on a touchscreen device. If not, get one
        and go to this page's URL (<tt>{window.location.href}</tt>
        ).
      </p>
      <Consent timeEstimate={state.timeEstimate} platform={state.platform} />
      <p>
        If you consent to participate, and if you're seeing this{" "}
        <b>on a touchscreen device</b>, tap here: <NextBtn />
      </p>
    </div>
  ))
);

export const Done = inject("clientId", "state")(
  observer(({ clientId, state }) => (
    <div>
      Thanks! Your code is <tt style={{ fontSize: "20pt" }}>{clientId}</tt>
      <br />
      <br />
      {state.isHDSL && (
        <p>
          Your participation has been logged. Expect to receive a gift
          certificate by email in the next few days. Thanks!
          <img src={state.sonaCreditLink} alt="" />
        </p>
      )}
    </div>
  ))
);

