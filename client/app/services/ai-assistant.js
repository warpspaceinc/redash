import { axios } from "@/services/axios";

/* eslint-disable compat/compat */

/**
 * AI Assistant service for chat-based SQL generation
 */
const AIAssistant = {
  /**
   * Check if AI is enabled and configured
   */
  status: () => axios.get("api/ai/status"),

  /**
   * Execute an approved query
   * @param {number} dataSourceId - Data source ID
   * @param {string} query - SQL query to execute
   * @returns {Promise} - Query result
   */
  executeQuery: (dataSourceId, query) =>
    axios.post("api/ai/execute-query", {
      data_source_id: dataSourceId,
      query,
    }),

  /**
   * Send a chat message and get streaming response
   * @param {number} dataSourceId - Data source ID
   * @param {Array} messages - Array of message objects {role, content}
   * @param {Object} callbacks - Callback functions for SSE events
   * @returns {Object} - Controller with abort method
   */
  chat: (dataSourceId, messages, callbacks = {}) => {
    const { onTextDelta, onToolStart, onToolResult, onDone, onError } = callbacks;

    // We need to use fetch for SSE since axios doesn't support streaming well
    const controller = new AbortController();

    // Get CSRF token from cookie
    const getCsrfToken = () => {
      const match = document.cookie.match(/csrf_token=([^;]+)/);
      return match ? match[1] : "";
    };

    const fetchSSE = async () => {
      try {
        const response = await fetch("/api/ai/chat", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-CSRF-Token": getCsrfToken(),
          },
          body: JSON.stringify({
            data_source_id: dataSourceId,
            messages,
          }),
          signal: controller.signal,
          credentials: "same-origin",
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.message || `HTTP error: ${response.status}`);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });

          // Parse SSE events from buffer
          const lines = buffer.split("\n");
          buffer = lines.pop() || ""; // Keep incomplete line in buffer

          let currentEvent = null;
          for (const line of lines) {
            if (line.startsWith("event: ")) {
              currentEvent = line.slice(7);
            } else if (line.startsWith("data: ") && currentEvent) {
              try {
                const data = JSON.parse(line.slice(6));
                handleEvent(currentEvent, data);
              } catch (e) {
                // Ignore parse errors for incomplete SSE data
              }
              currentEvent = null;
            }
          }
        }
      } catch (error) {
        if (error.name !== "AbortError") {
          if (onError) onError(error);
        }
      }
    };

    const handleEvent = (eventType, data) => {
      switch (eventType) {
        case "text_delta":
          if (onTextDelta) onTextDelta(data.text);
          break;
        case "tool_start":
          if (onToolStart) onToolStart(data.tool, data.id);
          break;
        case "tool_result":
          if (onToolResult) onToolResult(data.tool, data.result);
          break;
        case "done":
          if (onDone) onDone(data);
          break;
        case "error":
          if (onError) onError(new Error(data.message));
          break;
        default:
          break;
      }
    };

    // Start the fetch
    fetchSSE();

    // Return controller for aborting
    return {
      abort: () => controller.abort(),
    };
  },
};

export default AIAssistant;
