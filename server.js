const fs = require("fs");
const path = require("path");
const http = require("http");
const express = require("express");
const { WebSocketServer } = require("ws");
const chokidar = require("chokidar");

const PORT = process.env.PORT || 3333;
const CLAUDE_DIR = path.join(process.env.HOME, ".claude");
const TEAMS_DIR = path.join(CLAUDE_DIR, "teams");
const TASKS_DIR = path.join(CLAUDE_DIR, "tasks");
const HISTORY_DIR = path.join(CLAUDE_DIR, "swarm-history");
const PROJECTS_DIR = path.join(CLAUDE_DIR, "projects");

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

// ── State ──────────────────────────────────────────────────────────
let state = { teams: {}, sessions: [], history: [] };

function readJSON(filePath) {
  try {
    const raw = fs.readFileSync(filePath, "utf-8").trim();
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

// ── Scan a single team ─────────────────────────────────────────────
function scanTeam(teamName) {
  const configPath = path.join(TEAMS_DIR, teamName, "config.json");
  const config = readJSON(configPath);
  if (!config) return null;

  // Tasks
  const tasksDir = path.join(TASKS_DIR, teamName);
  const tasks = [];
  if (fs.existsSync(tasksDir)) {
    for (const f of fs.readdirSync(tasksDir)) {
      if (!f.endsWith(".json")) continue;
      const task = readJSON(path.join(tasksDir, f));
      if (task && task.id && !(task.metadata && task.metadata._internal)) {
        tasks.push(task);
      }
    }
  }

  // Inboxes
  const inboxDir = path.join(TEAMS_DIR, teamName, "inboxes");
  const inboxes = {};
  if (fs.existsSync(inboxDir)) {
    for (const f of fs.readdirSync(inboxDir)) {
      if (!f.endsWith(".json")) continue;
      const agentName = f.replace(".json", "");
      const msgs = readJSON(path.join(inboxDir, f));
      if (Array.isArray(msgs)) {
        inboxes[agentName] = msgs;
      }
    }
  }

  return {
    name: teamName,
    config,
    tasks: tasks.sort((a, b) => Number(a.id) - Number(b.id)),
    inboxes,
  };
}

// ── History / archiving ─────────────────────────────────────────────
function ensureHistoryDir() {
  if (!fs.existsSync(HISTORY_DIR)) fs.mkdirSync(HISTORY_DIR, { recursive: true });
}

function archiveTeam(teamData) {
  ensureHistoryDir();
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const filename = `${teamData.name}--${ts}.json`;
  const archivePath = path.join(HISTORY_DIR, filename);
  const record = { ...teamData, archivedAt: new Date().toISOString() };
  fs.writeFileSync(archivePath, JSON.stringify(record, null, 2));
  console.log(`📦 Archived team "${teamData.name}" → ${filename}`);
}

function loadHistory() {
  ensureHistoryDir();
  const entries = [];
  for (const f of fs.readdirSync(HISTORY_DIR)) {
    if (!f.endsWith(".json")) continue;
    const data = readJSON(path.join(HISTORY_DIR, f));
    if (data && data.name) {
      entries.push({
        file: f,
        name: data.name,
        archivedAt: data.archivedAt || null,
        description: (data.config && data.config.description) || "",
        agentCount: (data.config && data.config.members && data.config.members.length) || 0,
        taskCount: (data.tasks && data.tasks.length) || 0,
      });
    }
  }
  return entries.sort((a, b) => (b.archivedAt || "").localeCompare(a.archivedAt || ""));
}

// ── Session scanning ──────────────────────────────────────────────
const ACTIVE_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes

// Patterns that indicate a non-informative user message
const SKIP_PROMPTS = /^\[Request interrupted|^\s*$/;

function deriveSummary(text) {
  if (!text) return "Untitled";
  // If the prompt contains a markdown heading, use it as the title
  const headingMatch = text.match(/^#+\s+(.+)$/m);
  if (headingMatch) return headingMatch[1].trim().substring(0, 100);
  // Otherwise use the first non-empty line, stripping common prefixes
  const firstLine = text.split("\n").map((l) => l.trim()).find((l) => l && !SKIP_PROMPTS.test(l)) || text;
  return firstLine.substring(0, 100);
}

function extractUserText(obj) {
  const msg = obj.message || {};
  let text = "";
  if (typeof msg.content === "string") {
    text = msg.content.trim();
  } else if (Array.isArray(msg.content)) {
    text = msg.content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join(" ")
      .trim();
  }
  return text;
}

function extractSessionMeta(jsonlPath) {
  try {
    const raw = fs.readFileSync(jsonlPath, "utf-8");
    const lines = raw.split("\n").filter((l) => l.trim());
    let firstPrompt = "";
    let sessionId = "";
    let projectPath = "";
    let gitBranch = "";
    let isSidechain = false;
    let messageCount = 0;

    for (let i = 0; i < Math.min(lines.length, 40); i++) {
      try {
        const obj = JSON.parse(lines[i]);
        if (!sessionId && obj.sessionId) sessionId = obj.sessionId;
        if (obj.isSidechain) isSidechain = true;
        if (!projectPath && obj.cwd) projectPath = obj.cwd;
        if (!gitBranch && obj.gitBranch) gitBranch = obj.gitBranch;
        if (obj.type === "user" && !firstPrompt) {
          const text = extractUserText(obj);
          // Skip empty or non-informative messages
          if (text && !SKIP_PROMPTS.test(text)) {
            firstPrompt = text.substring(0, 120);
          }
        }
      } catch {}
    }

    // Count user+assistant messages for messageCount
    for (const line of lines) {
      try {
        const obj = JSON.parse(line);
        if (obj.type === "user" || obj.type === "assistant") messageCount++;
      } catch {}
    }

    return { sessionId, firstPrompt, projectPath, gitBranch, isSidechain, messageCount };
  } catch {
    return null;
  }
}

function scanSessions() {
  const sessions = [];
  if (!fs.existsSync(PROJECTS_DIR)) return sessions;

  try {
    for (const projDir of fs.readdirSync(PROJECTS_DIR)) {
      const projPath = path.join(PROJECTS_DIR, projDir);
      try {
        if (!fs.statSync(projPath).isDirectory()) continue;
      } catch { continue; }

      // Build index from sessions-index.json (if available)
      const indexPath = path.join(projPath, "sessions-index.json");
      const index = readJSON(indexPath);
      const indexedEntries = new Map();
      if (index && Array.isArray(index.entries)) {
        for (const entry of index.entries) {
          if (entry.sessionId) indexedEntries.set(entry.sessionId, entry);
        }
      }

      // Discover ALL .jsonl files in the project directory
      const seenIds = new Set();
      let jsonlFiles;
      try {
        jsonlFiles = fs.readdirSync(projPath).filter((f) => f.endsWith(".jsonl"));
      } catch { continue; }

      for (const file of jsonlFiles) {
        const sessionId = file.replace(".jsonl", "");
        if (seenIds.has(sessionId)) continue;
        seenIds.add(sessionId);

        const jsonlPath = path.join(projPath, file);

        // Determine active status: mtime < 5 min OR lock file exists
        let isActive = false;
        let fileMtime = null;
        try {
          const stat = fs.statSync(jsonlPath);
          fileMtime = stat.mtimeMs;
          if (Date.now() - stat.mtimeMs < ACTIVE_THRESHOLD_MS) isActive = true;
        } catch { continue; }
        // Also check lock file
        const lockPath = path.join(TASKS_DIR, sessionId, ".lock");
        try {
          if (fs.existsSync(lockPath)) isActive = true;
        } catch {}

        // Use index data if available, otherwise extract from JSONL
        const indexed = indexedEntries.get(sessionId);
        if (indexed) {
          // Skip sidechain (swarm agent) sessions
          if (indexed.isSidechain) continue;

          sessions.push({
            sessionId,
            summary: indexed.summary || deriveSummary(indexed.firstPrompt),
            firstPrompt: indexed.firstPrompt || "",
            messageCount: indexed.messageCount || 0,
            created: indexed.created || null,
            modified: indexed.modified || (fileMtime ? new Date(fileMtime).toISOString() : null),
            projectPath: indexed.projectPath || (index && index.originalPath) || "",
            gitBranch: indexed.gitBranch || "",
            isActive,
            jsonlPath,
          });
        } else {
          // Not in index — extract metadata from JSONL directly
          const meta = extractSessionMeta(jsonlPath);
          if (!meta || meta.isSidechain) continue;

          sessions.push({
            sessionId: meta.sessionId || sessionId,
            summary: deriveSummary(meta.firstPrompt),
            firstPrompt: meta.firstPrompt || "",
            messageCount: meta.messageCount || 0,
            created: fileMtime ? new Date(fileMtime).toISOString() : null,
            modified: fileMtime ? new Date(fileMtime).toISOString() : null,
            projectPath: meta.projectPath || (index && index.originalPath) || "",
            gitBranch: meta.gitBranch || "",
            isActive,
            jsonlPath,
          });
        }
      }
    }
  } catch {}

  // Sort: active first, then by modified desc
  sessions.sort((a, b) => {
    if (a.isActive !== b.isActive) return b.isActive ? 1 : -1;
    return (b.modified || "").localeCompare(a.modified || "");
  });

  return sessions;
}

// ── Session transcript parsing ──────────────────────────────────────
function summarizeToolInput(name, input) {
  if (!input) return "";
  if (name === "Bash" || name === "bash") return input.command || "";
  if (name === "Read" || name === "read") return input.file_path || "";
  if (name === "Write" || name === "write") return input.file_path || "";
  if (name === "Edit" || name === "edit") return input.file_path || "";
  if (name === "Glob" || name === "glob") return input.pattern || "";
  if (name === "Grep" || name === "grep") return `${input.pattern || ""} ${input.path || ""}`.trim();
  if (name === "Task") return input.description || "";
  if (name === "WebSearch" || name === "WebFetch") return input.query || input.url || "";
  return input.description || input.prompt || JSON.stringify(input).substring(0, 80);
}

function parseSessionEntry(obj) {
  if (!obj || !obj.type) return null;
  const base = { timestamp: obj.timestamp || null, uuid: obj.uuid || null };

  if (obj.type === "user") {
    const msg = obj.message || {};
    let text = "";
    if (typeof msg.content === "string") {
      text = msg.content;
    } else if (Array.isArray(msg.content)) {
      text = msg.content
        .filter((b) => b.type === "text")
        .map((b) => b.text)
        .join("\n");
    }
    return { ...base, kind: "user", text };
  }

  if (obj.type === "assistant") {
    const msg = obj.message || {};
    const content = msg.content;
    const parts = [];

    if (typeof content === "string") {
      parts.push({ type: "text", text: content });
    } else if (Array.isArray(content)) {
      for (const block of content) {
        if (block.type === "text" && block.text) {
          parts.push({ type: "text", text: block.text });
        } else if (block.type === "tool_use") {
          parts.push({
            type: "tool_use",
            name: block.name || "unknown",
            detail: summarizeToolInput(block.name, block.input),
          });
        }
      }
    }
    if (parts.length === 0) return null;
    return { ...base, kind: "assistant", parts };
  }

  // Skip progress and other types
  return null;
}

function readSessionTail(jsonlPath, tail) {
  try {
    const raw = fs.readFileSync(jsonlPath, "utf-8");
    const lines = raw.split("\n").filter((l) => l.trim());
    const slice = tail ? lines.slice(-tail) : lines;
    const entries = [];
    for (const line of slice) {
      try {
        const obj = JSON.parse(line);
        const entry = parseSessionEntry(obj);
        if (entry) entries.push(entry);
      } catch {}
    }
    return entries;
  } catch {
    return [];
  }
}

// ── Full scan ──────────────────────────────────────────────────────
let previousTeamNames = new Set();

function scanAll() {
  const teams = {};
  if (fs.existsSync(TEAMS_DIR)) {
    for (const d of fs.readdirSync(TEAMS_DIR)) {
      const stat = fs.statSync(path.join(TEAMS_DIR, d));
      if (!stat.isDirectory()) continue;
      const team = scanTeam(d);
      if (team) teams[d] = team;
    }
  }

  // Detect removed teams and archive them
  const currentNames = new Set(Object.keys(teams));
  for (const prev of previousTeamNames) {
    if (!currentNames.has(prev) && state.teams[prev]) {
      archiveTeam(state.teams[prev]);
    }
  }
  previousTeamNames = currentNames;

  state = { teams, sessions: scanSessions(), history: loadHistory(), timestamp: Date.now() };
}

// ── Broadcast to WebSocket clients ────────────────────────────────
function broadcast() {
  const payload = JSON.stringify(state);
  for (const client of wss.clients) {
    if (client.readyState === 1) client.send(payload);
  }
}

// Debounce broadcasts to avoid flooding on rapid file changes
let broadcastTimer = null;
function debouncedBroadcast() {
  if (broadcastTimer) clearTimeout(broadcastTimer);
  broadcastTimer = setTimeout(() => {
    scanAll();
    broadcast();
  }, 200);
}

// ── File watching ──────────────────────────────────────────────────
// Separate debounce for JSONL changes (session transcripts)
let jsonlBroadcastTimer = null;
function debouncedJsonlBroadcast() {
  if (jsonlBroadcastTimer) clearTimeout(jsonlBroadcastTimer);
  jsonlBroadcastTimer = setTimeout(() => {
    // Rescan sessions only, keep existing teams/history
    state = { ...state, sessions: scanSessions(), timestamp: Date.now() };
    broadcast();
    broadcastJsonlUpdates();
  }, 300);
}

function startWatcher() {
  const watchPaths = [TEAMS_DIR, TASKS_DIR].filter(fs.existsSync);
  if (watchPaths.length === 0) {
    console.log("⚠  No teams/tasks directories found yet. Watching for creation...");
    watchPaths.push(CLAUDE_DIR);
  }

  const watcher = chokidar.watch(watchPaths, {
    persistent: true,
    ignoreInitial: true,
    depth: 4,
    awaitWriteFinish: { stabilityThreshold: 100, pollInterval: 50 },
  });

  watcher.on("all", (event, filePath) => {
    if (filePath.endsWith(".json") || event === "addDir") {
      debouncedBroadcast();
    }
  });

  console.log(`👁  Watching: ${watchPaths.join(", ")}`);

  // Watch projects dir for JSONL and session index changes
  if (fs.existsSync(PROJECTS_DIR)) {
    const projWatcher = chokidar.watch(PROJECTS_DIR, {
      persistent: true,
      ignoreInitial: true,
      depth: 3,
      awaitWriteFinish: { stabilityThreshold: 150, pollInterval: 50 },
    });

    projWatcher.on("all", (event, filePath) => {
      if (filePath.endsWith(".jsonl") || filePath.endsWith("sessions-index.json")) {
        debouncedJsonlBroadcast();
      }
    });

    console.log(`👁  Watching sessions: ${PROJECTS_DIR}`);
  }
}

// ── Markdown export ─────────────────────────────────────────────────
function generateMarkdownReport(team) {
  const config = team.config || {};
  const members = config.members || [];
  const tasks = team.tasks || [];
  const inboxes = team.inboxes || {};
  const completed = tasks.filter(t => t.status === "completed").length;

  let md = `# Swarm Report: ${team.name}\n\n`;
  md += `> ${config.description || ""}\n\n`;
  md += `**Created:** ${config.createdAt ? new Date(config.createdAt).toLocaleString() : "Unknown"}\n\n`;
  md += `## Summary\n\n`;
  md += `- **Agents:** ${members.length}\n`;
  md += `- **Tasks:** ${tasks.length} (${completed} completed)\n`;
  md += `- **Messages:** ${Object.values(inboxes).reduce((s, m) => s + m.length, 0)}\n\n`;

  md += `## Agents\n\n`;
  md += `| Name | Role | Model |\n|------|------|-------|\n`;
  for (const m of members) {
    md += `| ${m.name} | ${m.agentType || ""} | ${m.model || ""} |\n`;
  }
  md += `\n`;

  md += `## Tasks\n\n`;
  for (const t of tasks) {
    const icon = t.status === "completed" ? "✅" : t.status === "in_progress" ? "🔄" : "⏳";
    md += `### ${icon} #${t.id}: ${t.subject}\n\n`;
    md += `- **Status:** ${t.status}\n`;
    if (t.owner) md += `- **Owner:** ${t.owner}\n`;
    if (t.blockedBy && t.blockedBy.length) md += `- **Blocked by:** ${t.blockedBy.map(id => "#" + id).join(", ")}\n`;
    if (t.blocks && t.blocks.length) md += `- **Blocks:** ${t.blocks.map(id => "#" + id).join(", ")}\n`;
    md += `\n`;
  }

  md += `## Activity Log\n\n`;
  const allMsgs = [];
  for (const [to, msgs] of Object.entries(inboxes)) {
    for (const msg of msgs) {
      try { JSON.parse(msg.text); continue; } catch {}
      allMsgs.push({ ...msg, to });
    }
  }
  allMsgs.sort((a, b) => (a.timestamp || "").localeCompare(b.timestamp || ""));
  const seen = new Set();
  for (const msg of allMsgs) {
    const key = `${msg.from}|${msg.timestamp}|${(msg.text || "").substring(0, 80)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const time = msg.timestamp ? new Date(msg.timestamp).toLocaleTimeString() : "";
    md += `- **${time}** \`${msg.from}\` → \`${msg.to}\`: ${msg.summary || (msg.text || "").substring(0, 120)}\n`;
  }

  return md;
}

// ── Routes ─────────────────────────────────────────────────────────
app.use("/features", express.static(path.join(__dirname, "features")));

app.get("/", (_req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

app.get("/api/state", (_req, res) => {
  res.json(state);
});

app.get("/api/export/:team", (req, res) => {
  const teamName = req.params.team;
  const team = state.teams[teamName];
  if (!team) return res.status(404).json({ error: "Team not found" });
  res.setHeader("Content-Type", "text/markdown");
  res.setHeader("Content-Disposition", `attachment; filename="${teamName}-report.md"`);
  res.send(generateMarkdownReport(team));
});

app.get("/api/history/:file", (req, res) => {
  const file = path.basename(req.params.file); // prevent traversal
  const filePath = path.join(HISTORY_DIR, file);
  const data = readJSON(filePath);
  if (data) res.json(data);
  else res.status(404).json({ error: "Not found" });
});

app.get("/api/session/:id", (req, res) => {
  const sessionId = req.params.id;
  const tail = parseInt(req.query.tail) || 200;

  // Find session in state
  const session = (state.sessions || []).find((s) => s.sessionId === sessionId);
  if (!session) return res.status(404).json({ error: "Session not found" });

  const entries = readSessionTail(session.jsonlPath, tail);
  res.json({ session, entries });
});

// ── WebSocket ──────────────────────────────────────────────────────
// Track session subscriptions: Map<sessionId, Set<ws>>
const sessionSubscriptions = new Map();
// Track line counts for incremental updates
const sessionLineCounts = new Map();

function broadcastJsonlUpdates() {
  for (const [sessionId, clients] of sessionSubscriptions) {
    const activeClients = [...clients].filter((c) => c.readyState === 1);
    if (activeClients.length === 0) {
      sessionSubscriptions.delete(sessionId);
      sessionLineCounts.delete(sessionId);
      continue;
    }

    const session = (state.sessions || []).find((s) => s.sessionId === sessionId);
    if (!session) continue;

    try {
      const raw = fs.readFileSync(session.jsonlPath, "utf-8");
      const lines = raw.split("\n").filter((l) => l.trim());
      const prevCount = sessionLineCounts.get(sessionId) || 0;

      if (lines.length > prevCount) {
        const newLines = lines.slice(prevCount);
        const entries = [];
        for (const line of newLines) {
          try {
            const entry = parseSessionEntry(JSON.parse(line));
            if (entry) entries.push(entry);
          } catch {}
        }

        if (entries.length > 0) {
          const payload = JSON.stringify({ type: "session_update", sessionId, entries });
          for (const client of activeClients) {
            client.send(payload);
          }
        }

        sessionLineCounts.set(sessionId, lines.length);
      }
    } catch {}
  }
}

wss.on("connection", (ws) => {
  ws.send(JSON.stringify(state));

  ws.on("message", (data) => {
    try {
      const msg = JSON.parse(data);
      if (msg.type === "subscribe_session" && msg.sessionId) {
        if (!sessionSubscriptions.has(msg.sessionId)) {
          sessionSubscriptions.set(msg.sessionId, new Set());
        }
        sessionSubscriptions.get(msg.sessionId).add(ws);

        // Initialize line count for this subscription
        const session = (state.sessions || []).find((s) => s.sessionId === msg.sessionId);
        if (session) {
          try {
            const raw = fs.readFileSync(session.jsonlPath, "utf-8");
            const count = raw.split("\n").filter((l) => l.trim()).length;
            sessionLineCounts.set(msg.sessionId, count);
          } catch {}
        }
      }
      if (msg.type === "unsubscribe_session" && msg.sessionId) {
        const subs = sessionSubscriptions.get(msg.sessionId);
        if (subs) {
          subs.delete(ws);
          if (subs.size === 0) {
            sessionSubscriptions.delete(msg.sessionId);
            sessionLineCounts.delete(msg.sessionId);
          }
        }
      }
    } catch {}
  });

  ws.on("close", () => {
    // Clean up subscriptions for this client
    for (const [sessionId, clients] of sessionSubscriptions) {
      clients.delete(ws);
      if (clients.size === 0) {
        sessionSubscriptions.delete(sessionId);
        sessionLineCounts.delete(sessionId);
      }
    }
  });
});

// ── Start ──────────────────────────────────────────────────────────
scanAll();
startWatcher();

server.listen(PORT, () => {
  const teamCount = Object.keys(state.teams).length;
  const sessionCount = (state.sessions || []).length;
  const activeSessionCount = (state.sessions || []).filter((s) => s.isActive).length;
  console.log(`\n🚀 Claude Console`);
  console.log(`   http://localhost:${PORT}`);
  console.log(`   ${teamCount} swarm(s), ${sessionCount} session(s) (${activeSessionCount} active)\n`);
});
