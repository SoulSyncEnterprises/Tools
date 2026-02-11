/**
 * delete_context
 * Remove a saved context by ID.
 */
module.exports = {
  name: "delete_context",
  description: "Delete a saved context",
  inputSchema: {
    type: "object",
    properties: {
      context_id: {
        type: "string",
        description: "The ID of the context to delete"
      }
    },
    required: ["context_id"]
  }
};
