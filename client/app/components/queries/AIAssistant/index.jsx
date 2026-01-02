import React, { useState, useCallback, useRef, useEffect } from "react";
import PropTypes from "prop-types";
import Modal from "antd/lib/modal";
import Button from "antd/lib/button";
import Alert from "antd/lib/alert";
import Tooltip from "@/components/Tooltip";
import AIAssistant from "@/services/ai-assistant";
import ChatMessage from "./ChatMessage";
import ChatInput from "./ChatInput";
import QueryApproval from "./QueryApproval";
import "./AIAssistant.less";

export default function AIAssistantModal({ dataSourceId, onInsertQuery, disabled }) {
  const [visible, setVisible] = useState(false);
  const [messages, setMessages] = useState([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState("");
  const [toolStatus, setToolStatus] = useState(null);
  const [aiStatus, setAiStatus] = useState({ enabled: false, configured: false, checked: false });
  const [error, setError] = useState(null);
  const [pendingApproval, setPendingApproval] = useState(null);
  const [approvalExecuting, setApprovalExecuting] = useState(false);
  const [approvalResult, setApprovalResult] = useState(null);
  const [approvalError, setApprovalError] = useState(null);
  const messagesEndRef = useRef(null);
  const chatControllerRef = useRef(null);
  const streamingContentRef = useRef("");
  const pendingToolCallRef = useRef(null);

  // Check AI status on mount
  useEffect(() => {
    AIAssistant.status()
      .then(status => {
        setAiStatus({ ...status, checked: true });
      })
      .catch(() => {
        setAiStatus({ enabled: false, configured: false, checked: true });
      });
  }, []);

  // Scroll to bottom on new messages
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, streamingContent]);

  const handleOpen = useCallback(() => {
    setVisible(true);
    setError(null);
  }, []);

  const handleClose = useCallback(() => {
    // Abort any ongoing request
    if (chatControllerRef.current) {
      chatControllerRef.current.abort();
      chatControllerRef.current = null;
    }
    setVisible(false);
    setMessages([]);
    setStreamingContent("");
    setToolStatus(null);
    setIsStreaming(false);
    setError(null);
    setPendingApproval(null);
    setApprovalExecuting(false);
    setApprovalResult(null);
    setApprovalError(null);
    pendingToolCallRef.current = null;
  }, []);

  const handleInsertAndClose = useCallback(
    query => {
      onInsertQuery(query);
      handleClose();
    },
    [onInsertQuery, handleClose]
  );

  const handleSendMessage = useCallback(
    userMessage => {
      if (!userMessage.trim() || isStreaming) return;

      const newMessages = [...messages, { role: "user", content: userMessage }];
      setMessages(newMessages);
      setIsStreaming(true);
      setStreamingContent("");
      streamingContentRef.current = "";
      setToolStatus(null);
      setError(null);

      let accumulatedContent = "";

      chatControllerRef.current = AIAssistant.chat(dataSourceId, newMessages, {
        onTextDelta: text => {
          accumulatedContent += text;
          setStreamingContent(accumulatedContent);
        },
        onToolStart: (tool, id) => {
          setToolStatus({ tool, id, status: "running" });
          // Store tool call info for potential approval
          if (tool === "execute_query") {
            pendingToolCallRef.current = { tool, id };
          }
        },
        onToolResult: (tool, result) => {
          // Check if this tool requires approval
          if (result && result.requires_approval) {
            // Pause streaming and show approval UI
            setPendingApproval({
              query: result.query,
              purpose: result.purpose,
              toolCallId: pendingToolCallRef.current?.id,
              accumulatedContent,
            });
            setToolStatus({ tool, status: "waiting_approval" });
            return;
          }
          setToolStatus({ tool, result, status: "done" });
        },
        onDone: result => {
          setMessages(prev => [...prev, { role: "assistant", content: accumulatedContent, usage: result.usage }]);
          setStreamingContent("");
          setToolStatus(null);
          setIsStreaming(false);
          chatControllerRef.current = null;
        },
        onError: err => {
          // If we have partial content, still show it
          if (accumulatedContent) {
            setMessages(prev => [...prev, { role: "assistant", content: accumulatedContent }]);
            setStreamingContent("");
          }
          setError(err.message);
          setIsStreaming(false);
          chatControllerRef.current = null;
        },
      });
    },
    [messages, dataSourceId, isStreaming]
  );

  const handleStopGeneration = useCallback(() => {
    if (chatControllerRef.current) {
      chatControllerRef.current.abort();
      chatControllerRef.current = null;
    }
    // Keep the partial content as a message
    if (streamingContent) {
      setMessages(prev => [...prev, { role: "assistant", content: streamingContent + "\n\n_(Generation stopped)_" }]);
    }
    setStreamingContent("");
    setToolStatus(null);
    setIsStreaming(false);
  }, [streamingContent]);

  const handleQueryApprove = useCallback(
    async approvedQuery => {
      if (!pendingApproval) return;

      setApprovalExecuting(true);
      setApprovalError(null);

      try {
        const result = await AIAssistant.executeQuery(dataSourceId, approvedQuery);

        if (result.error) {
          setApprovalError(result.error);
          setApprovalExecuting(false);
          return;
        }

        setApprovalResult(result.data);
        setApprovalExecuting(false);

        // Add message about the query execution
        const queryResultSummary = result.data?.rows
          ? `Query executed successfully. ${result.data.rows.length} rows returned.`
          : "Query executed successfully.";

        // Add the partial assistant content as a message if any
        if (pendingApproval.accumulatedContent) {
          setMessages(prev => [
            ...prev,
            { role: "assistant", content: pendingApproval.accumulatedContent + `\n\n✅ **Query Approved and Executed**\n${queryResultSummary}` },
          ]);
        } else {
          setMessages(prev => [
            ...prev,
            { role: "assistant", content: `✅ **Query Approved and Executed**\n${queryResultSummary}` },
          ]);
        }

        // Clear approval state
        setPendingApproval(null);
        setApprovalResult(null);
        setToolStatus(null);
        setIsStreaming(false);
      } catch (err) {
        setApprovalError(err.message || "Failed to execute query");
        setApprovalExecuting(false);
      }
    },
    [pendingApproval, dataSourceId]
  );

  const handleQueryReject = useCallback(() => {
    if (!pendingApproval) return;

    // Add message about rejection
    if (pendingApproval.accumulatedContent) {
      setMessages(prev => [
        ...prev,
        { role: "assistant", content: pendingApproval.accumulatedContent + "\n\n❌ **Query Rejected by User**\nThe query was not executed." },
      ]);
    } else {
      setMessages(prev => [
        ...prev,
        { role: "assistant", content: "❌ **Query Rejected by User**\nThe query was not executed." },
      ]);
    }

    // Clear approval state
    setPendingApproval(null);
    setApprovalResult(null);
    setApprovalError(null);
    setToolStatus(null);
    setIsStreaming(false);
  }, [pendingApproval]);

  const needsConfiguration = aiStatus.checked && (!aiStatus.enabled || !aiStatus.configured);

  const renderConfigurationMessage = () => {
    if (!aiStatus.enabled) {
      return (
        <Alert
          message="AI Assistant is Disabled"
          description={
            <span>
              AI assistant is not enabled. Please go to{" "}
              <a href="/admin/settings">Settings &gt; AI Query Generation</a> and enable it.
            </span>
          }
          type="warning"
          showIcon
        />
      );
    }
    if (!aiStatus.configured) {
      return (
        <Alert
          message="API Key Not Configured"
          description={
            <span>
              Anthropic API key is not configured. Please go to{" "}
              <a href="/admin/settings">Settings &gt; AI Query Generation</a> and enter your API key.
            </span>
          }
          type="warning"
          showIcon
        />
      );
    }
    return null;
  };

  return (
    <>
      <Tooltip title="AI SQL Assistant" placement="top">
        <Button
          className="ai-assistant-button m-r-5"
          disabled={disabled || !dataSourceId}
          onClick={handleOpen}>
          <i className="fa fa-magic" aria-hidden="true" />
          <span className="ai-button-text">AI</span>
        </Button>
      </Tooltip>

      <Modal
        title={
          <span>
            <i className="fa fa-magic m-r-5" aria-hidden="true" />
            AI SQL Assistant
          </span>
        }
        visible={visible}
        onCancel={handleClose}
        footer={null}
        width={800}
        destroyOnClose
        className="ai-assistant-modal">
        <div className="ai-assistant-container">
          {needsConfiguration ? (
            <div className="ai-assistant-config-message">{renderConfigurationMessage()}</div>
          ) : (
            <>
              <div className="ai-messages-container">
                {messages.length === 0 && !streamingContent && (
                  <div className="ai-welcome-message">
                    <div className="welcome-icon">
                      <i className="fa fa-magic" aria-hidden="true" />
                    </div>
                    <h3>AI SQL Assistant</h3>
                    <p>
                      Ask me anything about your data! I can help you write SQL queries, explore table structures, and
                      analyze data patterns.
                    </p>
                    <div className="welcome-examples">
                      <p>Try asking:</p>
                      <ul>
                        <li>&quot;What tables are available?&quot;</li>
                        <li>&quot;Show me the top 10 customers by order count&quot;</li>
                        <li>&quot;What columns are in the orders table?&quot;</li>
                      </ul>
                    </div>
                  </div>
                )}

                {messages.map((msg, idx) => (
                  <ChatMessage key={idx} message={msg} onInsertQuery={handleInsertAndClose} />
                ))}

                {streamingContent && (
                  <ChatMessage
                    message={{ role: "assistant", content: streamingContent }}
                    isStreaming
                    onInsertQuery={handleInsertAndClose}
                  />
                )}

                {/* Show thinking indicator when streaming but no content yet */}
                {isStreaming && !streamingContent && !toolStatus && (
                  <div className="ai-thinking-status">
                    <i className="fa fa-spinner fa-spin" />
                    <span>AI is thinking...</span>
                  </div>
                )}

                {toolStatus && toolStatus.status !== "waiting_approval" && (
                  <div className="ai-tool-status">
                    <i className={`fa ${toolStatus.status === "running" ? "fa-spinner fa-spin" : "fa-check"}`} />
                    <span>
                      {toolStatus.status === "running"
                        ? `Using tool: ${toolStatus.tool}...`
                        : `Tool ${toolStatus.tool} completed`}
                    </span>
                  </div>
                )}

                {pendingApproval && (
                  <QueryApproval
                    query={pendingApproval.query}
                    purpose={pendingApproval.purpose}
                    onApprove={handleQueryApprove}
                    onReject={handleQueryReject}
                    isExecuting={approvalExecuting}
                    result={approvalResult}
                    error={approvalError}
                  />
                )}

                {error && (
                  <div className="ai-error-message">
                    <Alert message="Error" description={error} type="error" showIcon />
                  </div>
                )}

                <div ref={messagesEndRef} />
              </div>

              <ChatInput
                onSend={handleSendMessage}
                disabled={isStreaming || !!pendingApproval}
                isStreaming={isStreaming}
                onStop={handleStopGeneration}
              />
            </>
          )}
        </div>
      </Modal>
    </>
  );
}

AIAssistantModal.propTypes = {
  dataSourceId: PropTypes.number,
  onInsertQuery: PropTypes.func.isRequired,
  disabled: PropTypes.bool,
};

AIAssistantModal.defaultProps = {
  dataSourceId: null,
  disabled: false,
};
