/**
 * get_answer
 * Check whether a previously asked question has been answered.
 */
module.exports = {
  name: "get_answer",
  description: "Check if a question you asked has been answered yet",
  inputSchema: {
    type: "object",
    properties: {
      question_id: {
        type: "string",
        description: "The ID of the question to check"
      }
    },
    required: ["question_id"]
  }
};
