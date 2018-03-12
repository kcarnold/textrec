import React, {Component} from 'react';
import {observer, inject} from 'mobx-react';


export const MasterView = viewsByName => inject('state', 'spying')(observer(class MasterView extends Component {
  componentDidUpdate() {
    if (!this.props.spying) {
      window.scrollTo(0, 0);
    }
  }

  render() {
    let {state, kind} = this.props;
    if (state.replaying) return <div>Loading...</div>;
    let screenDesc = state.screens[state.screenNum];
    let screenName = screenDesc.screen;
    console.assert(screenName in viewsByName);
    let viewProto = viewsByName[screenName];
    return (
      <div className="App">
        {React.createElement(viewProto)}
      </div>);
  }
}));

export default MasterView;
