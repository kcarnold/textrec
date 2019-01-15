/** @format */

import React from "react";
import { observer, inject } from "mobx-react";
import { NextBtn } from "./BaseViews";
import Consent from "./ConsentDesktop";

const SITE_DOWN = false;

export const Welcome = inject("state")(
  observer(({ state }) => (
    <div>
      {SITE_DOWN && (
        <h1 style={{ paddingBottom: "2500px" }}>
          Site down for maintenance, please try again in a few hours.
        </h1>
      )}
      <h1>Consent to Participate in Academic Research</h1>
      <Consent timeEstimate={state.timeEstimate} platform={state.platform} />
      <p>
        If you consent to participate, click here: <NextBtn />
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
