/** @format */

import React from "react";
import { findDOMNode } from "react-dom";
import isEqual from "lodash/isEqual";
import getCaretCoordinates from "textarea-caret";
// https://github.com/component/textarea-caret-position
import styles from "./Editable.module.css";

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

  emitChange() {
    let node = findDOMNode(this);
    let text = node.value;
    let range = { start: node.selectionStart, end: node.selectionEnd };
    if (
      text !== this.props.text ||
      range.start !== this.props.range.start ||
      range.end !== this.props.range.end
    ) {
      let caret = getCaretCoordinates(node, range.end);
      console.log("caret", caret);
      this.props.onChange({ text, range, caret });
    }
  }

  render() {
    return (
      <textarea
        className={styles.textarea}
        onInput={this.emitChange}
        onBlur={this.emitChange}
        onKeyDown={this.props.onKeyDown}
        onKeyUp={this.emitChange}
        onClick={this.emitChange}
        onScroll={this.emitChange}
      />
    );
  }
}
