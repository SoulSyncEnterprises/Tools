/**
 * update_guide
 * Update the user guide content in the database.
 */
module.exports = {
  name: "update_guide",
  description: "Update the Context Bridge user guide",
  inputSchema: {
    type: "object",
    properties: {
      content: {
        type: "string",
        description: "Updated markdown content for the guide"
      }
    },
    required: ["content"]
  }
};
