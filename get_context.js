/**
 * get_context
 * Retrieve a previously saved context by its ID.
 */
module.exports = {
  name: "get_context",
  description: "Retrieve previously saved conversation context",
  inputSchema: {
    type: "object",
    properties: {
      context_id: {
        type: "string",
        description: "The ID of the context to retrieve"
      }
    },
    required: ["context_id"]
  }
};
