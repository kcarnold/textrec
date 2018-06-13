import React, { Component } from "react";
import { observer, Provider } from "mobx-react";

import { MAX_PING_TIME } from './misc';

export const MasterView = screenToView =>
  observer(
    class MasterView extends Component {
      componentDidUpdate() {
        if (!this.props.spying) {
          window.scrollTo(0, 0);
        }
      }

      render() {
        let { state, dispatch, clientId, clientKind, spying } = this.props;
        spying = !!spying;
        if (state.replaying) return <div>Loading...</div>;
        if (clientKind === "p") {
          if (state.pingTime === null) {
            return (
              <div>
                Please wait while we test your phone's communication with our
                server.
              </div>
            );
          } else if (state.pingTime > MAX_PING_TIME) {
            return (
              <div>
                Sorry, your phone's connection to our server is too slow (your
                ping is {Math.round(state.pingTime)} ms). Check your WiFi
                connection and reload the page.
              </div>
            );
          }
        }
        return (
          <Provider
            state={state}
            dispatch={dispatch}
            clientId={clientId}
            clientKind={clientKind}
            spying={spying}
          >
            <div className="App">{screenToView(state.curScreen)}</div>
          </Provider>
        );
      }
    }
);

export default MasterView;
