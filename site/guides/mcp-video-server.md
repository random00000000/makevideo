---
title: Give any MCP client a video tool (Claude Desktop, Cursor, VS Code, Codex)
description: Run makevideo as a Model Context Protocol server so any MCP-capable assistant can preview and render narrated MP4 videos.
---

# A video tool for any MCP client

makevideo ships an MCP server over stdio:

```bash
npx -y github:random00000000/makevideo mcp
```

## Configure your client

Most clients accept this shape (Claude Desktop `claude_desktop_config.json`, Cursor `.cursor/mcp.json`, VS Code `mcp.json`, and others):

```json
{
  "mcpServers": {
    "makevideo": {
      "command": "npx",
      "args": ["-y", "github:random00000000/makevideo", "mcp"]
    }
  }
}
```

Claude Code: `claude mcp add makevideo -- npx -y github:random00000000/makevideo mcp`, or install the plugin (`/plugin marketplace add random00000000/makevideo`), which bundles the server and a skill.

## From the official MCP Registry

makevideo is listed in the official MCP Registry as **`io.github.random00000000/makevideo`**, as a Docker image. Clients that browse the registry can install it from there. To run the image yourself:

```bash
docker run -i --rm -v "$PWD:/work" -w /work ghcr.io/random00000000/makevideo mcp
```

Mount the folder that holds your Markdown and media at `/work`; rendered MP4s land there too.

## Tools

| tool | what it does |
|---|---|
| `make_video` | Render Markdown or a JSON spec to MP4 (+ captions, poster, report). `fast: true` for the fast voice. Streams progress notifications. |
| `preview_video` | One still per scene as an **image** the model can look at, plus lint suggestions. ~1 s, no audio. |
| `check_video` | Instant validation: problems, quality warnings, estimated duration. |
| `video_reference` | Scene types with examples, transitions, voices, themes, formats and the Markdown syntax. |

## Tips

- Pass `baseDir` so relative media paths (clips, images) resolve where your files are.
- First renders download the voice model; run `npx -y github:random00000000/makevideo setup` once on new machines.
