/** @format */

import React from "react";
import { findDOMNode } from "react-dom";
import isEqual from "lodash/isEqual";
import getCaretCoordinates from "textarea-caret";
// https://github.com/component/textarea-caret-position

export class Editable extends React.Component {
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
    let { range } = this.props;
    if (range) {
      let { start, end } = range;
      node.setSelectionRange(start, end);
    }
    node.focus();
  }

  emitChange = () => {
    let node = findDOMNode(this);
    let text = node.value;
    let range = { start: node.selectionStart, end: node.selectionEnd };
    if (
      text !== this.props.text ||
      (this.props.range &&
        (range.start !== this.props.range.start ||
          range.end !== this.props.range.end))
    ) {
      let { top: caretTop, left: caretLeft } = getCaretCoordinates(
        node,
        range.end
      );
      let caret = { top: caretTop, left: caretLeft };
      console.log("caret", caret);
      this.props.onChange({ text, range, caret });
    }
  };

  render() {
    return (
      <textarea
        className={"Editable"}
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
