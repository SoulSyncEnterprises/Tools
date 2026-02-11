/**
 * ask_instance
 * Send a question to another Claude instance. Supports auto-polling for the
 * answer with configurable timeout and interval. Factual questions can be
 * auto-answered; opinions/decisions require manual user approval.
 */
module.exports = {
  name: "ask_instance",
  description: "Ask a specific question to another Claude instance. Factual questions are answered automatically. Opinions/decisions require user approval.",
  inputSchema: {
    type: "object",
    properties: {
      target: {
        type: "string",
        description: "Which instance to ask",
        enum: ["vs-code", "web", "mobile"]
      },
      question: {
        type: "string",
        description: "The question to ask. Be specific and clear."
      },
      context: {
        type: "string",
        description: "Optional background context to help answer the question"
      },
      _askedBy: {
        type: "string",
        description: "Instance asking the question (auto-set by caller)"
      },
      wait_for_answer: {
        type: "boolean",
        description: "Wait for answer before returning (default: true)"
      },
      poll_interval: {
        type: "number",
        description: "Polling interval in ms (default: 3000, range: 1000-10000)"
      },
      timeout: {
        type: "number",
        description: "Max wait time in ms (default: 60000, max: 120000)"
      }
    },
    required: ["target", "question"]
  }
};
