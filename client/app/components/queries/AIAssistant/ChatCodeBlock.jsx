import React, { useState } from "react";
import PropTypes from "prop-types";
import Button from "antd/lib/button";
import Tooltip from "@/components/Tooltip";

export default function ChatCodeBlock({ code, onUseQuery }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    // Fallback for older browsers
    const copyToClipboard = text => {
      if (window.navigator.clipboard && window.navigator.clipboard.writeText) {
        return window.navigator.clipboard.writeText(text);
      }
      // Fallback using execCommand
      const textArea = document.createElement("textarea");
      textArea.value = text;
      textArea.style.position = "fixed";
      textArea.style.left = "-9999px";
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand("copy");
      document.body.removeChild(textArea);
      return Promise.resolve();
    };

    copyToClipboard(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="chat-code-block">
      <div className="code-block-header">
        <span className="code-language">SQL</span>
        <div className="code-block-actions">
          <Tooltip title={copied ? "Copied!" : "Copy to clipboard"}>
            <Button type="text" size="small" onClick={handleCopy} className="code-action-btn">
              <i className={`fa ${copied ? "fa-check" : "fa-copy"}`} aria-hidden="true" />
            </Button>
          </Tooltip>
        </div>
      </div>
      <pre className="code-block-content">{code}</pre>
      <div className="code-block-footer">
        <Button type="primary" size="small" onClick={onUseQuery}>
          <i className="fa fa-check m-r-5" aria-hidden="true" />
          Use This Query
        </Button>
      </div>
    </div>
  );
}

ChatCodeBlock.propTypes = {
  code: PropTypes.string.isRequired,
  onUseQuery: PropTypes.func.isRequired,
};
