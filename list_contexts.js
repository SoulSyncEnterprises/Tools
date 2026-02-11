/**
 * list_contexts
 * List all saved contexts, optionally filtered by tag.
 */
module.exports = {
  name: "list_contexts",
  description: "List all available saved contexts",
  inputSchema: {
    type: "object",
    properties: {
      limit: {
        type: "number",
        description: "Maximum number to return (default 20, max 100)"
      },
      tag: {
        type: "string",
        description: "Optional: filter by tag"
      }
    }
  }
};
