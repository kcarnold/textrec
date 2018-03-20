import React from 'react';
import map from 'lodash/map';
import {namedConditions} from './MasterStateStore';

const DemoList = () => <ul>{
    map(namedConditions, (val, key) => <li key={key}><a href={`?demo${key}-p`}>{key}</a></li>)
    }</ul>;
export default DemoList;
