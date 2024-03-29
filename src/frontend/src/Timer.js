/** @format */
import React, { Component } from "react";
import { observer, inject } from "mobx-react";

const Timer = inject("state")(
  observer(
    class Timer extends Component {
      state = { remain: Infinity };
      tick = () => {
        let { state, timedOut } = this.props;
        if (!state.timerStartedAt) return;
        let elapsed = (+new Date() - state.timerStartedAt) / 1000;
        let remain = Math.max(0, state.timerDur - elapsed);
        this.setState({ remain });
        if (remain > 0) {
          this.timeout = setTimeout(this.tick, 100);
        } else {
          this.timeout = null;
          timedOut();
        }
      };

      componentDidMount() {
        this.tick();
      }

      componentWillUnmount() {
        if (this.timeout) {
          clearTimeout(this.timeout);
        }
      }

      render() {
        let { remain } = this.state;
        if (Math.abs(remain) > 1e10) remain = 0;
        let remainMin = Math.floor(remain / 60);
        let remainSec = ("00" + Math.floor(remain - 60 * remainMin)).slice(-2);
        return (
          <span className="timer">
            {remainMin}:{remainSec}
          </span>
        );
      }
    }
  )
);

export default Timer;
