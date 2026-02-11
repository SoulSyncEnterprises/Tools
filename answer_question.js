/**
 * answer_question
 * Respond to a pending question. Auto-answerable questions are logged
 * to the audit trail for review.
 */
module.exports = {
  name: "answer_question",
  description: "Answer a question that was asked by another Claude instance",
  inputSchema: {
    type: "object",
    properties: {
      question_id: {
        type: "string",
        description: "The ID of the question to answer"
      },
      answer: {
        type: "string",
        description: "Your answer to the question"
      }
    },
    required: ["question_id", "answer"]
  }
};
