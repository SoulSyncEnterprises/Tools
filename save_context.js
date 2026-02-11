/**
 * save_context
 * Store a conversation context for retrieval by any Claude instance.
 * Contexts are keyed by a unique ID and can be tagged for filtering.
 */
module.exports = {
  name: "save_context",
  description: "Save conversation context for sharing between Claude instances",
  inputSchema: {
    type: "object",
    properties: {
      context_id: {
        type: "string",
        description: "Unique identifier (lowercase, hyphens, no spaces)"
      },
      title: {
        type: "string",
        description: "Human-readable title"
      },
      messages: {
        type: "string",
        description: "The conversation context to save"
      },
      tags: {
        type: "array",
        items: { type: "string" },
        description: "Optional tags for filtering"
      }
    },
    required: ["context_id", "title", "messages"]
  }
};
