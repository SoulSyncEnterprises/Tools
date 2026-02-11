/**
 * view_audit_log
 * Review recent auto-answered questions for transparency and oversight.
 */
module.exports = {
  name: "view_audit_log",
  description: "View recent auto-answered questions for review",
  inputSchema: {
    type: "object",
    properties: {
      limit: {
        type: "number",
        description: "Number of recent auto-answers to show (default 20)"
      }
    }
  }
};
