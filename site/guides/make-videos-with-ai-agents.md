---
title: How to make narrated videos with an AI agent (Claude Code, Codex, Cursor)
description: A repeatable way for coding agents to produce narrated, captioned MP4 videos — explainers, recaps, changelogs, demos — without building a new pipeline every time.
---

# How to make narrated videos with an AI agent

When you ask a coding agent for a video, it usually improvises: it picks some text-to-speech service, maybe installs a headless browser to draw frames, guesses scene timings, and wrestles ffmpeg flags. Every video comes out different, often silent, and renders can take many minutes.

**makevideo** gives agents one standard path instead: write the video as Markdown (or JSON), run one command, get an MP4 with narration, captions and transitions.

## The three-step loop

```bash
npx -y github:random00000000/makevideo check video.md     # instant validation + quality hints
npx -y github:random00000000/makevideo preview video.md   # contact sheet PNG of every scene (~1 s)
npx -y github:random00000000/makevideo video.md           # video.mp4 + .srt + poster + report
```

The agent writes `video.md`:

```md
# Weekly update
What shipped this week
> Here is what shipped this week.

## Highlights
- Faster builds
- New onboarding
> Two highlights. Builds are faster. And onboarding is new.

## Decisions
- Ship on Friday?
> One decision for you. Do we ship on Friday?
```

Each `##` heading is a scene. Lines starting with `>` are the narration; if a scene has none, its visible text is read aloud — narration is the default, not an afterthought.

## Make every agent in a project use it

```bash
npx -y github:random00000000/makevideo agents --all
```

This writes a short, idempotent "use makevideo for videos" block into `AGENTS.md` (read by Codex, Cursor, Copilot, Amp and others), `CLAUDE.md`, `.cursor/rules/makevideo.mdc` and `.github/copilot-instructions.md`. Use `--global` to install it for Claude Code and Codex on the whole machine.

## Or give the agent a tool

- **Claude Code plugin:** `/plugin marketplace add random00000000/makevideo` then `/plugin install makevideo@makevideo`.
- **Any MCP client:** add the server `npx -y github:random00000000/makevideo mcp`. Tools: `make_video`, `preview_video` (returns the contact sheet as an image the model can see), `check_video`, `video_reference`.

## Why agents do better with a standard

- **Same voice every time** (a local neural voice), so a project's videos sound like one series.
- **Timing comes from the real audio**, so captions and list reveals never drift.
- **Errors are written for agents** — each names the scene and includes a working example.
- **Lint catches bad videos before rendering**: walls of text, unsynced lists, repetitive pacing.
- **Runs on CPU** with no API key, which matters in cloud sandboxes.
