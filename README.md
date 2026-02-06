# Claude Console

Real-time dashboard for all your Claude Code activity — solo sessions and swarm teams in one place.

![Claude Console](https://img.shields.io/badge/Claude_Code-Dashboard-cyan)

## Features

- **Unified home screen** — see all active sessions, recent history, and archived swarms at a glance
- **Live session viewer** — click any session to see its full transcript with tool calls rendered inline
- **Swarm mission control** — kanban task board, agent roster, communication graph, activity feed
- **Real-time updates** — WebSocket-powered, no refresh needed
- **11 feature plugins** — progress bars, elapsed timers, confetti on completion, sound effects, keyboard shortcuts, and more

## Quick Start

```bash
git clone https://github.com/antonber/claude-console.git
cd claude-console
npm install
npm start
```

Then open **http://localhost:3333**

## Requirements

- Node.js 18+
- Claude Code (sessions are read from `~/.claude/`)

## How It Works

Claude Console watches your `~/.claude/` directory for changes and displays:

| Source | What it shows |
|--------|--------------|
| `~/.claude/projects/*/` | Solo Claude Code sessions (JSONL transcripts) |
| `~/.claude/teams/` | Active swarm team configs and agent inboxes |
| `~/.claude/tasks/` | Swarm task boards |
| `~/.claude/swarm-history/` | Archived swarm snapshots |

Active sessions are detected via file modification time (< 5 min) or lock files.

## Views

### Home Screen
Card grid showing active swarms, live sessions, recent sessions, and archived swarms. Click any card to drill in.

### Session Detail
Two-column layout with the full conversation transcript on the left (user messages, assistant responses, tool calls with icons) and session metadata on the right.

### Swarm Detail
Full mission control: agent roster with status indicators, kanban task board, communication graph, timeline visualization, and activity feed.

## Configuration

| Environment Variable | Default | Description |
|---------------------|---------|-------------|
| `PORT` | `3333` | Server port |

## Project Structure

```
server.js          — Express + WebSocket server, file watchers, session/team scanning
index.html         — Single-page app with router, home screen, session & swarm views
features/          — 11 self-registering plugins (progress bar, timers, sounds, etc.)
```

## License

MIT
