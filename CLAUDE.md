# Claude Instructions

## File Selection and Management

Use the repoprompt MCP tools for file selection and related operations:

- Use `mcp__repoprompt__manage_selection` for managing the current file selection
- Use `mcp__repoprompt__file_search` for searching files by path and content
- Use `mcp__repoprompt__get_file_tree` for exploring project structure
- Use `mcp__repoprompt__read_file` for reading file contents
- Use `mcp__repoprompt__get_code_structure` for understanding code organization

## Development Server Ports

- Frontend: ONLY run on port 3000
- Backend: ONLY run on port 8000
- If ports are blocked, kill existing processes first using `lsof` and `kill` commands