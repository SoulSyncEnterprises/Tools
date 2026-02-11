/**
 * list_project_files
 * List all project files (excludes the guide). Supports tag filtering.
 */
module.exports = {
  name: "list_project_files",
  description: "List all project documentation files",
  inputSchema: {
    type: "object",
    properties: {
      limit: {
        type: "number",
        description: "Maximum number to return (default 20)"
      },
      tag: {
        type: "string",
        description: "Optional: filter by tag"
      }
    }
  }
};
