/**
 * get_project_file
 * Retrieve a project file by its ID.
 */
module.exports = {
  name: "get_project_file",
  description: "Retrieve a project documentation file",
  inputSchema: {
    type: "object",
    properties: {
      file_id: {
        type: "string",
        description: "The project file ID"
      }
    },
    required: ["file_id"]
  }
};
