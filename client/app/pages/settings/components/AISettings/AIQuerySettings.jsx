import React, { useState } from "react";
import Button from "antd/lib/button";
import Checkbox from "antd/lib/checkbox";
import Form from "antd/lib/form";
import Input from "antd/lib/input";
import Row from "antd/lib/row";
import Skeleton from "antd/lib/skeleton";
import Alert from "antd/lib/alert";
import notification from "@/services/notification";
import DynamicComponent from "@/components/DynamicComponent";
import { axios } from "@/services/axios";
import { SettingsEditorPropTypes, SettingsEditorDefaultProps } from "../prop-types";

export default function AIQuerySettings(props) {
  const { values, onChange, loading } = props;
  const [testing, setTesting] = useState(false);

  const hasApiKey = values.ai_api_key_masked && values.ai_api_key_masked.length > 0;
  const hasNewApiKey = values.ai_api_key && values.ai_api_key.length > 0;

  const testApiKey = () => {
    setTesting(true);
    axios
      .post("api/ai/test-api-key", { api_key: values.ai_api_key || "" })
      .then(response => {
        if (response.success) {
          notification.success(response.message);
        } else {
          notification.error(response.message);
        }
      })
      .catch(error => {
        notification.error("Failed to test API key: " + (error.message || "Unknown error"));
      })
      .finally(() => {
        setTesting(false);
      });
  };

  return (
    <DynamicComponent name="OrganizationSettings.AIQuerySettings" {...props}>
      <Alert
        message="AI Query Generation"
        description="Enable AI-powered SQL query generation using Claude. Users can describe queries in natural language, and the AI will generate SQL based on the data source schema."
        type="info"
        showIcon
        className="m-b-15"
      />

      <Form.Item label="Enable AI Query Generation">
        {loading ? (
          <Skeleton.Input active style={{ width: 200 }} />
        ) : (
          <Row>
            <Checkbox
              name="ai_query_generation_enabled"
              checked={values.ai_query_generation_enabled}
              onChange={e => onChange({ ai_query_generation_enabled: e.target.checked })}>
              Enable AI query generation for all users
            </Checkbox>
          </Row>
        )}
      </Form.Item>

      <Form.Item
        label="Anthropic API Key"
        extra={
          hasApiKey ? (
            <span style={{ color: "#52c41a" }}>
              <i className="fa fa-check-circle m-r-5" aria-hidden="true" />
              API key is configured: {values.ai_api_key_masked}
            </span>
          ) : (
            <span style={{ color: "#faad14" }}>
              <i className="fa fa-warning m-r-5" aria-hidden="true" />
              No API key configured. Get your API key from{" "}
              <a href="https://console.anthropic.com/" target="_blank" rel="noopener noreferrer">
                console.anthropic.com
              </a>
            </span>
          )
        }>
        {loading ? (
          <Skeleton.Input active style={{ width: 400 }} />
        ) : (
          <Row style={{ display: "flex", gap: "8px", alignItems: "flex-start" }}>
            <Input.Password
              name="ai_api_key"
              value={values.ai_api_key}
              onChange={e => onChange({ ai_api_key: e.target.value })}
              placeholder={hasApiKey ? "Enter new API key to replace existing one" : "sk-ant-api03-..."}
              style={{ maxWidth: 400 }}
            />
            <Button
              onClick={testApiKey}
              loading={testing}
              disabled={!hasApiKey && !hasNewApiKey}
              icon={<i className="fa fa-plug m-r-5" aria-hidden="true" />}>
              Test Connection
            </Button>
          </Row>
        )}
      </Form.Item>

      {!values.ai_query_generation_enabled && (
        <Alert
          message="AI Query Generation is disabled"
          description="Enable the feature above to allow users to generate SQL queries using AI."
          type="warning"
          showIcon
          className="m-b-15"
        />
      )}
    </DynamicComponent>
  );
}

AIQuerySettings.propTypes = SettingsEditorPropTypes;

AIQuerySettings.defaultProps = SettingsEditorDefaultProps;
