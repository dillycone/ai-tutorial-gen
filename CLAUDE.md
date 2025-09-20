## File Selection and Management

Use the repoprompt MCP tools for file selection and related operations:

- Use `mcp__repoprompt__manage_selection` for managing the current file selection
- Use `mcp__repoprompt__file_search` for searching files by path and content
- Use `mcp__repoprompt__get_file_tree` for exploring project structure
- Use `mcp__repoprompt__read_file` for reading file contents
- Use `mcp__repoprompt__get_code_structure` for understanding code organization

## RepoPrompt Tool Permissions

The following tools are available from the `repoprompt` MCP server. Use them with the listed permissions and guardrails.

### Selection & Discovery (read)

- `mcp__repoprompt__manage_selection` — Allowed to set/replace the current selection. Keep selections minimal and relevant to the task; never point outside this repository.
- `mcp__repoprompt__file_search` — Read‑only search across paths and content; safe to use freely.
- `mcp__repoprompt__get_file_tree` — Read‑only project structure introspection.
- `mcp__repoprompt__read_file` — Read‑only. Prefer reading files in chunks (≤250 lines) and reference files by path and line.
- `mcp__repoprompt__get_code_structure` — Read‑only code organization introspection.

### Editing & File Changes (write)

- `mcp__repoprompt__apply_edits` — Allowed for targeted, minimal diffs within this repository. Keep changes narrowly scoped to the task; do not reformat unrelated code, mass‑rename files, or add license headers. Prefer surgical edits over large rewrites. Do not run VCS commands or create commits.
- `mcp__repoprompt__file_actions` — Create/Move/Delete. Creation is allowed for files that are directly required by the task. Move/Rename only when essential to the change or explicitly requested. Delete operations require explicit user direction; otherwise prefer deprecation over removal.

### Workspace & Window Management

- `mcp__repoprompt__list_windows` — Read‑only; safe to enumerate.
- `mcp__repoprompt__select_window` — Do not change the active window unless the user explicitly asks you to switch.
- `mcp__repoprompt__manage_workspaces` — Listing is allowed. Do not switch or modify workspaces unless explicitly requested.

### Context & Prompt

- `mcp__repoprompt__workspace_context` — Read‑only; safe to snapshot context. Avoid embedding unnecessarily large blobs into replies; reference files by path and line instead.
- `mcp__repoprompt__prompt` — Read and Append are allowed for adding small, session‑scoped notes. Do not `clear` or wholesale `set` the shared prompt unless the user explicitly requests it.

### Chats & Models (meta)

- `mcp__repoprompt__chats` — Read‑only listing is allowed.
- `mcp__repoprompt__chat_send` — Do not create or send side‑channel messages unless the user explicitly requests you to operate within a RepoPrompt chat.
- `mcp__repoprompt__list_models` — Read‑only; safe to enumerate available model presets.

## Development Server Ports

- Frontend: ONLY run on port 3000
- Backend: ONLY run on port 8000
- If ports are blocked, kill existing processes first using `lsof` and `kill` commands
