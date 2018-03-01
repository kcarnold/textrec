import React, { Component } from 'react';
import {MasterStateStore} from './MasterStateStore';
import {MasterView} from './MasterView';
import * as Wrapper from './Wrapper';

export function init(clientId, clientKind) {
  let state = new MasterStateStore(clientId || '');
  return Wrapper.init(state, clientId, clientKind);
}

export const App = ({global}) => <Wrapper.View global={global}><MasterView kind={global.clientKind} /></Wrapper.View>;
