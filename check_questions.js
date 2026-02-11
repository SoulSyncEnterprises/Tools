/**
 * check_questions
 * View pending questions from other instances. Separates auto-answerable
 * questions from those requiring manual approval.
 */
module.exports = {
  name: "check_questions",
  description: "Check for questions that other Claude instances have asked you. Returns pending questions separated into auto-answerable and requires-approval categories.",
  inputSchema: {
    type: "object",
    properties: {
      instance_name: {
        type: "string",
        description: "Your instance name: 'vs-code', 'web', or 'mobile'"
      },
      include_answered: {
        type: "boolean",
        description: "Include already answered questions (default: false)"
      }
    },
    required: ["instance_name"]
  }
};
