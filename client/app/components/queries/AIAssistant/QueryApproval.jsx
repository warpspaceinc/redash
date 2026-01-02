import React, { useState } from "react";
import PropTypes from "prop-types";
import Button from "antd/lib/button";
import Input from "antd/lib/input";
import Alert from "antd/lib/alert";
import Spin from "antd/lib/spin";

const { TextArea } = Input;

// Simple SQL syntax highlighting
function highlightSQL(sql) {
  if (!sql) return sql;

  const keywords = [
    'SELECT', 'FROM', 'WHERE', 'AND', 'OR', 'NOT', 'IN', 'IS', 'NULL',
    'JOIN', 'INNER', 'LEFT', 'RIGHT', 'OUTER', 'ON', 'AS',
    'GROUP', 'BY', 'ORDER', 'ASC', 'DESC', 'LIMIT', 'OFFSET',
    'HAVING', 'DISTINCT', 'COUNT', 'SUM', 'AVG', 'MIN', 'MAX',
    'INSERT', 'INTO', 'VALUES', 'UPDATE', 'SET', 'DELETE',
    'CREATE', 'TABLE', 'DROP', 'ALTER', 'INDEX', 'VIEW',
    'UNION', 'ALL', 'CASE', 'WHEN', 'THEN', 'ELSE', 'END',
    'BETWEEN', 'LIKE', 'EXISTS', 'TRUE', 'FALSE', 'WITH'
  ];

  // Escape HTML
  let highlighted = sql
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // Highlight strings (single quotes)
  highlighted = highlighted.replace(
    /'([^'\\]|\\.)*'/g,
    '<span style="color: #98c379;">$&</span>'
  );

  // Highlight numbers
  highlighted = highlighted.replace(
    /\b(\d+\.?\d*)\b/g,
    '<span style="color: #d19a66;">$1</span>'
  );

  // Highlight keywords (case insensitive)
  const keywordPattern = new RegExp(`\\b(${keywords.join('|')})\\b`, 'gi');
  highlighted = highlighted.replace(
    keywordPattern,
    '<span style="color: #c678dd; font-weight: 500;">$1</span>'
  );

  // Highlight comments
  highlighted = highlighted.replace(
    /(--.*$)/gm,
    '<span style="color: #5c6370; font-style: italic;">$1</span>'
  );

  return highlighted;
}

export default function QueryApproval({
  query,
  purpose,
  onApprove,
  onReject,
  isExecuting,
  result,
  error,
}) {
  const [editedQuery, setEditedQuery] = useState(query);
  const [isEditing, setIsEditing] = useState(false);

  const handleApprove = () => {
    onApprove(editedQuery);
  };

  const handleReject = () => {
    onReject();
  };

  const toggleEdit = () => {
    setIsEditing(!isEditing);
    if (!isEditing) {
      setEditedQuery(query);
    }
  };

  // If we have a result or error, show the outcome
  if (result || error) {
    return (
      <div className="query-approval query-approval-complete">
        <div className="query-approval-header">
          <i className={`fa ${result ? "fa-check-circle" : "fa-times-circle"}`} />
          <span>{result ? "Query Executed" : "Query Failed"}</span>
        </div>
        <div className="query-code-block">
          <pre dangerouslySetInnerHTML={{ __html: highlightSQL(editedQuery) }} />
        </div>
        {error && (
          <Alert message="Error" description={error} type="error" showIcon className="m-t-10" />
        )}
        {result && (
          <div className="query-result-summary">
            <i className="fa fa-table m-r-5" />
            {result.rows ? `${result.rows.length} rows returned` : "Query executed successfully"}
          </div>
        )}
      </div>
    );
  }

  // If executing, show loading state
  if (isExecuting) {
    return (
      <div className="query-approval query-approval-executing">
        <div className="query-approval-header">
          <Spin size="small" />
          <span className="m-l-10">Executing query...</span>
        </div>
        <div className="query-code-block">
          <pre dangerouslySetInnerHTML={{ __html: highlightSQL(editedQuery) }} />
        </div>
      </div>
    );
  }

  // Show approval request
  return (
    <div className="query-approval">
      <div className="query-approval-header">
        <i className="fa fa-exclamation-triangle" />
        <span>Query Execution Request</span>
      </div>

      {purpose && (
        <div className="query-purpose">
          <strong>Purpose:</strong> {purpose}
        </div>
      )}

      <div className="query-code-block">
        {isEditing ? (
          <TextArea
            value={editedQuery}
            onChange={e => setEditedQuery(e.target.value)}
            autoSize={{ minRows: 3, maxRows: 10 }}
            className="query-edit-textarea"
          />
        ) : (
          <pre dangerouslySetInnerHTML={{ __html: highlightSQL(editedQuery) }} />
        )}
      </div>

      <div className="query-approval-actions">
        <Button type="primary" onClick={handleApprove} icon={<i className="fa fa-check m-r-5" />}>
          Approve & Run
        </Button>
        <Button onClick={toggleEdit} icon={<i className="fa fa-edit m-r-5" />}>
          {isEditing ? "Preview" : "Edit"}
        </Button>
        <Button danger onClick={handleReject} icon={<i className="fa fa-times m-r-5" />}>
          Reject
        </Button>
      </div>

      {editedQuery !== query && (
        <div className="query-modified-notice">
          <i className="fa fa-info-circle m-r-5" />
          Query has been modified from original
        </div>
      )}
    </div>
  );
}

QueryApproval.propTypes = {
  query: PropTypes.string.isRequired,
  purpose: PropTypes.string,
  onApprove: PropTypes.func.isRequired,
  onReject: PropTypes.func.isRequired,
  isExecuting: PropTypes.bool,
  result: PropTypes.object,
  error: PropTypes.string,
};

QueryApproval.defaultProps = {
  purpose: null,
  isExecuting: false,
  result: null,
  error: null,
};
