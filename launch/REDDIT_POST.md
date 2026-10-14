# Reddit post: paste-ready

**Video:** [`docs/your-agent-can-make-videos.mp4`](../docs/your-agent-can-make-videos.mp4) (1 min 39 s, 5.7 MB). The older 59-second demo, [`docs/makevideo-reddit.mp4`](../docs/makevideo-reddit.mp4), works as a backup or for a second subreddit.
**Where:** r/ClaudeAI first (use the showcase / "Built with Claude" flair if offered). Post r/ClaudeCode and r/LocalLLaMA a day or two later, not all at once.

## Title (pick one)
1. Karpathy said bespoke explainer videos are the output format he's most bullish on, so I gave my agent a free, local video tool. This video was made by it.
2. Your agent can make videos now. This one was written, voiced and rendered by Claude on a laptop CPU.

## Body (post text, or first comment if the video post doesn't allow text)
On Oct 2 Andrej Karpathy posted that fully custom explainer videos are the output format he's most bullish on. His example prompt used a paid voice API, or free local alternatives if you don't have a key.

So I built that free, local alternative: **makevideo**. The video above was made entirely by an agent with it, with no editing.

- Tell your agent "make a video about X". It writes Markdown scenes, and `> lines` are the narration
- A local neural voice (Kokoro, the same voice every time), captions, transitions, charts
- Runs on a plain CPU with no GPU, no API key and no browser. This 99-second video rendered in 75 s on a laptop
- Claude Code plugin + MCP server (it's in the official MCP Registry)

```
/plugin marketplace add random00000000/makevideo
/plugin install makevideo@makevideo
```
Any MCP client: `npx -y github:random00000000/makevideo mcp`

Repo: https://github.com/random00000000/makevideo · Docs: https://random00000000.github.io/makevideo/
MIT. Not affiliated with Karpathy; his post just named the gap.

## After posting
Reply to comments in the first hour. If someone asks "how", the answer is that the whole video is one JSON file: examples/agents-make-videos.json in the repo.
