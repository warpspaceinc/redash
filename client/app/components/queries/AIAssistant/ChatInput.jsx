import React, { useState, useCallback } from "react";
import PropTypes from "prop-types";
import Input from "antd/lib/input";
import Button from "antd/lib/button";

const { TextArea } = Input;

export default function ChatInput({ onSend, disabled, isStreaming, onStop }) {
  const [message, setMessage] = useState("");

  const handleSend = useCallback(() => {
    if (message.trim() && !disabled) {
      onSend(message.trim());
      setMessage("");
    }
  }, [message, disabled, onSend]);

  const handleKeyDown = useCallback(
    e => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend]
  );

  return (
    <div className="chat-input-container">
      <TextArea
        placeholder="Ask about your data or request a SQL query... (Enter to send, Shift+Enter for new line)"
        value={message}
        onChange={e => setMessage(e.target.value)}
        onKeyDown={handleKeyDown}
        rows={2}
        disabled={disabled}
        autoFocus
        className="chat-input-textarea"
      />
      <div className="chat-input-actions">
        {isStreaming ? (
          <Button onClick={onStop} danger>
            <i className="fa fa-stop m-r-5" aria-hidden="true" />
            Stop
          </Button>
        ) : (
          <Button type="primary" onClick={handleSend} disabled={disabled || !message.trim()}>
            <i className="fa fa-paper-plane m-r-5" aria-hidden="true" />
            Send
          </Button>
        )}
      </div>
    </div>
  );
}

ChatInput.propTypes = {
  onSend: PropTypes.func.isRequired,
  disabled: PropTypes.bool,
  isStreaming: PropTypes.bool,
  onStop: PropTypes.func,
};

ChatInput.defaultProps = {
  disabled: false,
  isStreaming: false,
  onStop: () => {},
};
