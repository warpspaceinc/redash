import React, { useState, useEffect, useCallback } from "react";
import PropTypes from "prop-types";
import Button from "antd/lib/button";
import Modal from "antd/lib/modal";
import Input from "antd/lib/input";
import Alert from "antd/lib/alert";
import Spin from "antd/lib/spin";
import Tooltip from "@/components/Tooltip";
import notification from "@/services/notification";
import AIQuery from "@/services/ai-query";

import "./AIQueryGenerator.less";

const { TextArea } = Input;

export default function AIQueryGenerator({ dataSourceId, onInsertQuery, disabled }) {
  const [visible, setVisible] = useState(false);
  const [requirement, setRequirement] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [aiStatus, setAiStatus] = useState({ enabled: false, configured: false, checked: false });

  // Check AI status on mount
  useEffect(() => {
    AIQuery.status()
      .then(status => {
        setAiStatus({ ...status, checked: true });
      })
      .catch(() => {
        setAiStatus({ enabled: false, configured: false, checked: true });
      });
  }, []);

  const handleOpen = useCallback(() => {
    setVisible(true);
    setResult(null);
    setError(null);
  }, []);

  const handleClose = useCallback(() => {
    setVisible(false);
    setRequirement("");
    setResult(null);
    setError(null);
  }, []);

  const handleGenerate = useCallback(async () => {
    if (!requirement.trim()) {
      notification.warning("Please enter a requirement.");
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const response = await AIQuery.generate(dataSourceId, requirement);
      setResult(response);
    } catch (err) {
      const errorMessage = err.response?.data?.message || err.message || "Failed to generate query.";
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  }, [dataSourceId, requirement]);

  const handleInsert = useCallback(() => {
    if (result && result.query) {
      onInsertQuery(result.query);
      handleClose();
      notification.success("Query inserted into editor.");
    }
  }, [result, onInsertQuery, handleClose]);

  const handleKeyPress = useCallback(
    e => {
      if (e.key === "Enter" && e.ctrlKey) {
        handleGenerate();
      }
    },
    [handleGenerate]
  );

  // Check if AI is not configured or not enabled
  const needsConfiguration = aiStatus.checked && (!aiStatus.enabled || !aiStatus.configured);

  // Render configuration message in modal
  const renderConfigurationMessage = () => {
    if (!aiStatus.enabled) {
      return (
        <Alert
          message="AI Query Generation is Disabled"
          description={
            <span>
              AI query generation is not enabled.
              Please go to <a href="/admin/settings">Settings &gt; AI Query Generation</a> and enable it.
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
              Anthropic API key is not configured.
              Please go to <a href="/admin/settings">Settings &gt; AI Query Generation</a> and enter your API key.
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
      <Tooltip title="Generate SQL query using AI" placement="top">
        <Button
          className="ai-query-button m-r-5"
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
            AI Query Generator
          </span>
        }
        visible={visible}
        onCancel={handleClose}
        footer={null}
        width={700}
        destroyOnClose>
        <div className="ai-query-generator-content">
          {needsConfiguration ? (
            renderConfigurationMessage()
          ) : (
            <>
              <div className="ai-input-section">
                <label htmlFor="ai-requirement">Describe what you want to query:</label>
                <TextArea
                  id="ai-requirement"
                  placeholder="e.g., Show me the top 10 users by order count in the last 30 days..."
                  value={requirement}
                  onChange={e => setRequirement(e.target.value)}
                  onKeyPress={handleKeyPress}
                  rows={3}
                  disabled={loading}
                  autoFocus
                />
                <div className="ai-hint">
                  Press <kbd>Ctrl</kbd> + <kbd>Enter</kbd> to generate
                </div>
              </div>

              <div className="ai-action-section">
                <Button type="primary" onClick={handleGenerate} loading={loading} disabled={!requirement.trim()}>
                  {loading ? "Generating..." : "Generate Query"}
                </Button>
              </div>

              {error && (
                <Alert
                  message="Error"
                  description={error}
                  type="error"
                  showIcon
                  className="ai-error-alert"
                />
              )}

              {loading && (
                <div className="ai-loading-section">
                  <Spin size="large" />
                  <p>Analyzing schema and generating query...</p>
                </div>
              )}

              {result && (
                <div className="ai-result-section">
                  <div className="ai-result-header">
                    <span className="ai-result-title">Generated Query:</span>
                    {result.usage && (
                      <span className="ai-token-usage">
                        Tokens: {result.usage.input_tokens + result.usage.output_tokens}
                      </span>
                    )}
                  </div>

                  <pre className="ai-result-query">{result.query}</pre>

                  <div className="ai-result-actions">
                    <Button type="primary" onClick={handleInsert}>
                      <i className="fa fa-paste m-r-5" aria-hidden="true" />
                      Insert into Editor
                    </Button>
                    <Button onClick={() => setResult(null)}>
                      Generate Another
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </Modal>
    </>
  );
}

AIQueryGenerator.propTypes = {
  dataSourceId: PropTypes.number,
  onInsertQuery: PropTypes.func.isRequired,
  disabled: PropTypes.bool,
};

AIQueryGenerator.defaultProps = {
  dataSourceId: null,
  disabled: false,
};
