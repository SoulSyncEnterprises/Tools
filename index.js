/**
 * Claude Context Bridge — MCP Tool Definitions
 *
 * 14 tools across 3 categories:
 *   Context Management (4)   — save, get, list, delete shared contexts
 *   Inter-Instance Comms (5) — ask/answer questions between Claude instances
 *   Project Files (5)        — persistent markdown documents (guide + project files)
 *
 * @see https://modelcontextprotocol.io
 */

const toolDefinitions = [
  // Context Management
  require('./save_context'),
  require('./get_context'),
  require('./list_contexts'),
  require('./delete_context'),

  // Inter-Instance Communication
  require('./ask_instance'),
  require('./check_questions'),
  require('./answer_question'),
  require('./get_answer'),
  require('./view_audit_log'),

  // Project Files & Guide
  require('./get_guide'),
  require('./update_guide'),
  require('./get_project_file'),
  require('./update_project_file'),
  require('./list_project_files'),
];

module.exports = { toolDefinitions };
