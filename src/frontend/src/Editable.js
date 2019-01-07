/** @format */

import React from "react";
import { findDOMNode } from "react-dom";
import isEqual from "lodash/isEqual";

export class Editable extends React.Component {
  constructor() {
    super();
    this.emitChange = this.emitChange.bind(this);
  }

  shouldComponentUpdate(nextProps, nextState) {
    return (
      this.props.text !== nextProps.text ||
      !isEqual(this.props.range, nextProps.range)
    );
  }

  componentDidMount() {
    this.updateContent();
  }

  componentDidUpdate() {
    this.updateContent();
  }

  updateContent() {
    let node = findDOMNode(this);
    window.EDITABLE = node;
    node.value = this.props.text;
    let { start, end } = this.props.range;
    node.setSelectionRange(start, end);
    node.focus();
  }

  emitChange(e) {
    let node = findDOMNode(this);
    let text = node.value;
    let range = { start: node.selectionStart, end: node.selectionEnd };
    if (
      text !== this.props.text ||
      range.start !== this.props.range.start ||
      range.end !== this.props.range.end
    ) {
      this.props.onChange({ text, range });
    }
  }

  render() {
    return (
      <textarea
        style={{
          position: "relative",
          width: "100%",
          height: "300px",
          overflow: "auto",
          fontFamily: "sans-serif",
        }}
        onInput={this.emitChange}
        onBlur={this.emitChange}
        onKeyDown={this.props.onKeyDown}
      />
    );
  }
}
