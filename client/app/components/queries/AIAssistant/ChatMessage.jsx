import React from "react";
import PropTypes from "prop-types";
import ChatCodeBlock from "./ChatCodeBlock";

/**
 * Extract SQL code blocks from markdown content
 */
function extractParts(content) {
  if (!content) return [];

  const codeBlockRegex = /```(?:sql)?\n?([\s\S]*?)```/g;
  const parts = [];
  let lastIndex = 0;
  let match;

  while ((match = codeBlockRegex.exec(content)) !== null) {
    // Text before code block
    if (match.index > lastIndex) {
      const textBefore = content.slice(lastIndex, match.index).trim();
      if (textBefore) {
        parts.push({ type: "text", content: textBefore });
      }
    }

    // Code block
    const code = match[1].trim();
    if (code) {
      parts.push({ type: "code", content: code });
    }

    lastIndex = match.index + match[0].length;
  }

  // Remaining text
  if (lastIndex < content.length) {
    const remaining = content.slice(lastIndex).trim();
    if (remaining) {
      parts.push({ type: "text", content: remaining });
    }
  }

  // If no parts were found, treat entire content as text
  if (parts.length === 0 && content.trim()) {
    parts.push({ type: "text", content: content.trim() });
  }

  return parts;
}

/**
 * Simple markdown to HTML conversion for basic formatting
 */
function renderMarkdown(text) {
  if (!text) return null;

  // Convert markdown-style formatting to HTML
  let html = text
    // Escape HTML
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    // Bold
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    // Italic
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    // Inline code
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    // Line breaks
    .replace(/\n/g, "<br />");

  return <span dangerouslySetInnerHTML={{ __html: html }} />;
}

export default function ChatMessage({ message, onInsertQuery, isStreaming }) {
  const { role, content, usage } = message;

  if (role === "user") {
    return (
      <div className="chat-message chat-message-user">
        <div className="message-avatar">
          <i className="fa fa-user" aria-hidden="true" />
        </div>
        <div className="message-content">
          <div className="message-text">{content}</div>
        </div>
      </div>
    );
  }

  if (role === "error") {
    return (
      <div className="chat-message chat-message-error">
        <div className="message-content">
          <i className="fa fa-exclamation-circle m-r-5" aria-hidden="true" />
          {content}
        </div>
      </div>
    );
  }

  // Assistant message - parse for code blocks
  const parts = extractParts(content);

  return (
    <div className="chat-message chat-message-assistant">
      <div className="message-avatar">
        <i className="fa fa-magic" aria-hidden="true" />
      </div>
      <div className="message-content">
        {parts.map((part, idx) => {
          if (part.type === "code") {
            return <ChatCodeBlock key={idx} code={part.content} onUseQuery={() => onInsertQuery(part.content)} />;
          }
          return (
            <div key={idx} className="message-text">
              {renderMarkdown(part.content)}
            </div>
          );
        })}
        {isStreaming && <span className="typing-cursor">|</span>}
        {usage && (
          <div className="message-usage">
            <i className="fa fa-info-circle" aria-hidden="true" />
            <span>Tokens: {usage.input_tokens + usage.output_tokens}</span>
          </div>
        )}
      </div>
    </div>
  );
}

ChatMessage.propTypes = {
  message: PropTypes.shape({
    role: PropTypes.string.isRequired,
    content: PropTypes.string.isRequired,
    usage: PropTypes.shape({
      input_tokens: PropTypes.number,
      output_tokens: PropTypes.number,
    }),
  }).isRequired,
  onInsertQuery: PropTypes.func,
  isStreaming: PropTypes.bool,
};

ChatMessage.defaultProps = {
  onInsertQuery: () => {},
  isStreaming: false,
};
