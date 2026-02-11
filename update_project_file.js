/**
 * update_project_file
 * Create or update a project file. Validates content size against MAX_CONTEXT_SIZE.
 */
module.exports = {
  name: "update_project_file",
  description: "Create or update a project documentation file",
  inputSchema: {
    type: "object",
    properties: {
      file_id: {
        type: "string",
        description: "Unique identifier (lowercase, hyphens, no spaces)"
      },
      title: {
        type: "string",
        description: "Human-readable title"
      },
      content: {
        type: "string",
        description: "Markdown content"
      },
      tags: {
        type: "array",
        items: { type: "string" },
        description: "Optional tags for organization"
      }
    },
    required: ["file_id", "title", "content"]
  }
};
