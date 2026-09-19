# OCSM - OpenCode Session Manager

Session manager for OpenCode. List, search, resume, export and backup sessions from any directory.

## Features

- **CLI mode**: Pick up where you left off without starting OpenCode first
- **TUI tools**: AI can list, search, switch, and manage sessions during a session
- **Any directory**: Manage sessions without navigating to the project directory
- **i18n**: Chinese and English support
- **Export**: Save sessions as JSON, Markdown, or plain text
- **Backup**: Batch backup all or selected sessions
- **Cloud Sync**: Push sessions to GitHub private repo, pull and restore anywhere

## Install

### npm (recommended)

```bash
npm install -g opencode-ocsm
ocsm lang   # select language on first run
ocsm help
```
#### If you encounter an `EACCES` error on Linux/WSL, it is recommended to install Node.js using nvm to avoid using `sudo npm install -g`.

### As OpenCode plugin

Add to `~/.config/opencode/opencode.jsonc`:

```json
{
  "plugin": ["opencode-ocsm"]
}
```

Then build:

```bash
git clone https://github.com/evil-qq-intestine/OpenCode-Session-Manager.git
cd OpenCode-Session-Manager
npm install && npm run build
```

## Usage

### CLI

```bash
ocsm                  # interactive session picker (default)
ocsm list             # list recent sessions
ocsm select           # interactive session picker with search
ocsm resume <id>      # resume a session
ocsm export <id>      # export session (JSON, bundle, markdown, text)
ocsm import <file>    # import session from JSON (only JSON supported to ensure session integrity)
ocsm backup --all     # backup all sessions
ocsm cloud push       # push session to GitHub private repo
ocsm cloud pull       # pull session from GitHub repo
ocsm cloud list       # list sessions in GitHub repo
ocsm cloud setup      # setup GitHub config
ocsm lang             # switch language
ocsm help             # show help
```

> **Note**: Import only supports JSON format to ensure session integrity and preserve all metadata.

### TUI tools

Available in OpenCode for the AI to call:

| Tool | Description |
|------|-------------|
| `session_list` | List sessions with search and pagination |
| `session_search` | Search session content |
| `session_switch` | Switch to a session |
| `session_info` | Get session details |
| `session_export` | Export session as JSON or bundle |
| `session_import` | Import session from JSON file (JSON only to ensure integrity) |
| `session_backup` | Backup sessions |

### Examples

#### Before starting OpenCode

```bash
$ ocsm list

=== Session List ===

[1] Auth module development (25 messages, 2026/09/15 14:30)
[2] Login API optimization (18 messages, 2026/09/14 10:20)
[3] OAuth integration (32 messages, 2026/09/13 16:45)

$ ocsm resume ses_abc123def456
```

#### Inside OpenCode

```
User: Find the session where we discussed login functionality
AI: [calls session_search]
Found 3 related sessions:
1. "Auth module development" - 2026/09/15 14:30 (25 messages)
2. "Login API optimization" - 2026/09/14 10:20 (18 messages)
3. "OAuth integration" - 2026/09/13 16:45 (32 messages)

User: Open the first one
AI: [calls session_switch]
Switched to "Auth module development"
Run in terminal to continue:
> opencode run --session ses_abc123def456
```

## Config

Plugin options in `~/.config/opencode/opencode.jsonc`:

```json
{
  "plugin": [
    ["file:///path/to/opencode-session-picker", {
      "maxSessions": 50
    }]
  ]
}
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `maxSessions` | number | 20 | Max sessions to display |

Language config saved to `~/.config/opencode/ocsm-lang.json`.

### Cloud Sync

Cloud sync requires [GitHub CLI](https://cli.github.com/) installed and logged in.

```bash
# First time setup
gh auth login
ocsm cloud setup

# Push session to cloud
ocsm cloud push

# Pull session from cloud
ocsm cloud pull

# List sessions in a cloud repo
ocsm cloud list
```

When pushing:
- Sessions are exported to a GitHub private repo
- If the session's code is on GitHub, the repo URL is recorded in the JSON
- If no GitHub repo is detected, only the session is exported

When pulling:
- Enter the repo URL to fetch sessions
- Select which session to import
- If a code repo is referenced, option to clone it locally

## Dependencies

- **Runtime**: `better-sqlite3`, `inquirer`
- **peerDependency**: `@opencode-ai/plugin` (optional, needed for TUI tools)
- **No dependency on other OpenCode plugins**

## Database

OpenCode session data location:

| Platform | Path |
|----------|------|
| Linux | `~/.local/share/opencode/opencode.db` |
| macOS | `~/Library/Application Support/OpenCode/opencode.db` |
| Windows | `%APPDATA%\OpenCode\opencode.db` |

## Development

```bash
git clone https://github.com/evil-qq-intestine/OpenCode-Session-Manager.git
cd OpenCode-Session-Manager
npm install
npm run build       # build
npm run dev         # watch mode
npm run typecheck   # type check
```

### Add New Language

1. Copy `locales/en.json` to `locales/xx.json`
2. Translate the strings
3. Add `'xx'` to `Language` type in `src/i18n.ts`
4. Submit PR

### Structure

```
opencode-session-picker/
├── src/
│   ├── index.ts      # OpenCode plugin entry (TUI tools)
│   ├── cli.ts        # CLI commands
│   ├── db.ts         # SQLite database reader
│   ├── types.ts      # Type definitions
│   ├── i18n.ts       # Internationalization
│   └── setup.ts      # Setup wizard
├── locales/
│   ├── zh.json       # Chinese translations
│   └── en.json       # English translations
├── dist/
├── package.json
├── tsconfig.json
└── README.md
```

## License

MIT
