import React, {Component} from 'react';
import {observer, inject} from 'mobx-react';


export const MasterView = screenToView => inject('state', 'spying')(observer(class MasterView extends Component {
  componentDidUpdate() {
    if (!this.props.spying) {
      window.scrollTo(0, 0);
    }
  }

  render() {
    let {state, kind} = this.props;
    if (state.replaying) return <div>Loading...</div>;
    return (
      <div className="App">
        {screenToView(state.curScreen)}
      </div>);
  }
}));

export default MasterView;
