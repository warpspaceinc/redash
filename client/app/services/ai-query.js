import { axios } from "@/services/axios";

const AIQuery = {
  /**
   * Check if AI query generation is available
   * @returns {Promise<{enabled: boolean, configured: boolean}>}
   */
  status: () => axios.get("api/ai/status"),

  /**
   * Generate SQL query using AI
   * @param {number} dataSourceId - Data source ID
   * @param {string} requirement - Natural language requirement
   * @returns {Promise<{query: string, model: string, usage: {input_tokens: number, output_tokens: number}}>}
   */
  generate: (dataSourceId, requirement) =>
    axios.post("api/ai/generate-query", {
      data_source_id: dataSourceId,
      requirement,
    }),
};

export default AIQuery;
