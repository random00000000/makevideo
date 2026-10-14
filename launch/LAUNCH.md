# makevideo launch kit

These drafts are for you to post from your own accounts. Each one links to https://github.com/random00000000/makevideo. Attach `docs/showcase.mp4` or `docs/tiktok.gif` wherever the site allows media; a video does much better than a link.

## Done already (by Claude)
- Official MCP Registry: `io.github.random00000000/makevideo` (Docker image on ghcr.io), published automatically on every release.
- GitHub social preview image set.
- PR to punkpeye/awesome-mcp-servers (needs the Glama step below).
- mcpservers.org: submitted on the free plan with your email (review within 2 weeks; they email you).

## Dated follow-ups
- **On or after Oct 21 2026:** PR to transitive-bullshit/awesome-ffmpeg (their rule: projects must be at least 7 days old). Add it to the bottom of "## JavaScript": `- [makevideo](https://github.com/random00000000/makevideo) - Narrated, captioned MP4 videos from Markdown or JSON scenes, with a local TTS voice and automatic transitions.` In the PR, explain how it differs from editly: narration, captions and agent tooling are built in.
- **On or after Oct 28 2026:** awesome-claude-code, via its human-only web form (see below).

## Needs you (accounts or personal data)
- **Glama** (https://glama.ai/mcp/servers): sign in, add the repo, and let its checks run (the Dockerfile is ready and tested in CI). Then add the score badge to the awesome-mcp-servers PR.

## Order (most reach per minute first)

1. **npm + MCP Registry (one-time, about 3 minutes)**: on npmjs.com, sign in, then go to Access Tokens, then Generate New Token, and choose "Automation". In GitHub, open the repo, then Settings, then Secrets and variables, then Actions, and add a new secret named `NPM_TOKEN`. After that, every GitHub release publishes to npm (with provenance) and to the official MCP Registry automatically. Re-run the latest "publish" workflow to publish 0.4.0 now.
2. **GitHub social preview**: open Settings, then General, then Social preview, and upload `docs/social-card.jpg`. This is the card people see when the link is shared.
3. **Hacker News (Show HN)**: post on a weekday morning, US Eastern time.
4. **Reddit**: post to r/ClaudeAI, then r/ClaudeCode, then r/node, a day or two apart rather than all at once.
5. **X / Bluesky**: post the thread below with the TikTok GIF.
6. **On or after Oct 28 2026**: submit to awesome-claude-code. It requires a project that is at least 14 days old, and a human must fill in its web form at https://github.com/hesreallyhim/awesome-claude-code/issues/new?template=recommend-resource.yml. Use one line, no pitch, no emoji: `makevideo — Node library and Claude Code plugin that renders narrated, captioned MP4s from a JSON scene spec on CPU, with a local TTS voice.`

Already done: a PR adding makevideo to punkpeye/awesome-mcp-servers (96k stars; that list accepts agent PRs). Nothing to do for the plugin directories: quemsah/awesome-claude-plugins indexes repos that ship `.claude-plugin/` automatically.

---

## Show HN

**Title:** Show HN: makevideo – narrated videos from JSON, built for AI agents, CPU-only

**Body:**
My coding agents kept getting asked for videos (patch notes, devlogs, explainers), and every time they improvised a new pipeline: a different TTS, a different voice, a headless browser, guessed timings, and sometimes 10-minute renders.

makevideo is the boring standard version. You write a JSON list of scenes, each with a line to say. It voices them locally with Kokoro-82M (same voice every time, no API key), times each scene to the real audio, burns in captions, and encodes with a bundled ffmpeg. There's no browser and no GPU.

The trick that made it fast on CPU: slide videos are mostly still frames. It works out which frames can change (reveals, caption changes, fades), draws only those, and lets ffmpeg's loop filter repeat the held frames after colour conversion, where repeats are nearly free. An 87 s video went from 160 s to 35 s on a 6-core laptop.

The agent-facing parts: `check` returns errors that name the scene and include a working example, `preview` gives a contact sheet of every scene in about a second, and `--json` output is meant for tools. It also ships as a Claude Code plugin, so "make a video about X" just works.

It also does TikTok-style word captions, GIFs in and out, and screen recording for game trailers. It ships an MCP server (`npx -y github:random00000000/makevideo mcp`), and `makevideo agents --all` writes "use makevideo for videos" into a repo's AGENTS.md, CLAUDE.md, Cursor rules and Copilot instructions. Docs: https://random00000000.github.io/makevideo/

MIT. Feedback welcome, especially on what scene types are missing.

## Reddit: r/ClaudeAI / r/ClaudeCode

**Title:** I made a Claude Code plugin so "make a video" produces a narrated MP4 in about 30 s (CPU only, no API key)

**Body:**
```
/plugin marketplace add random00000000/makevideo
/plugin install makevideo@makevideo
```
Then say "make a video about what changed this week". Claude writes a JSON scene list, previews it, and renders a narrated, captioned MP4 with a local voice. There's no ElevenLabs key and no browser. It also makes TikTok/Shorts with word-by-word captions.

The changelog video in the README was made by the tool about its own build. Repo: https://github.com/random00000000/makevideo

## r/node

**Title:** makevideo: JSON → narrated MP4 in Node, no browser (Skia canvas + ffmpeg + local Kokoro TTS)

**Body:** Short version of the HN post. Lead with the frame-holding trick and the numbers (160 s → 35 s); r/node will care about the pipeline, not the agents.

## X / Bluesky thread

1. Agents get asked for videos all the time, and every one builds a different pipeline. So I made makevideo: JSON in, narrated MP4 out. Same voice every time, captions, CPU-only, no API key. 🧵 [attach tiktok.gif]
2. Every scene has a `say` line. The scene length comes from the real audio, so nothing drifts.
3. Speed: slides are mostly still frames, so only the frames that change get drawn and encoded. An 87 s video renders in 35 s on a laptop CPU.
4. It ships as a Claude Code plugin. Say "make a video" and you get an MP4. github.com/random00000000/makevideo
