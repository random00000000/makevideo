// MCP protocol test: the server speaks clean JSON-RPC over stdio (no stray stdout output).
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';

const p = spawn(process.execPath, ['bin/makevideo.js', 'mcp'], { stdio: ['pipe', 'pipe', 'inherit'] });
const waiters = new Map();
let buf = '';
p.stdout.on('data', (d) => {
  buf += d;
  for (let i; (i = buf.indexOf('\n')) >= 0; ) {
    const line = buf.slice(0, i); buf = buf.slice(i + 1);
    const m = JSON.parse(line); // throws if anything but JSON-RPC reaches stdout
    waiters.get(m.id)?.(m);
  }
});
let id = 0;
const rpc = (method, params = {}) => new Promise((r) => { const i = ++id; waiters.set(i, r); p.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: i, method, params }) + '\n'); });

const init = await rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '0' } });
assert.equal(init.result.serverInfo.name, 'makevideo');
const { tools } = (await rpc('tools/list')).result;
assert.deepEqual(tools.map((t) => t.name).sort(), ['check_video', 'make_video', 'preview_video', 'video_reference']);
const chk = await rpc('tools/call', { name: 'check_video', arguments: { markdown: '# Hi\n> Hello there.\n## Points\n- A\n- B\n> Two. A. B.' } });
assert.equal(JSON.parse(chk.result.content[0].text).ok, true);
const bad = await rpc('tools/call', { name: 'check_video', arguments: { spec: { scenes: [{ type: 'clip' }] } } });
assert.equal(JSON.parse(bad.result.content[0].text).ok, false);
const prev = await rpc('tools/call', { name: 'preview_video', arguments: { markdown: '# Hi\n> Hello there.' } });
assert.equal(prev.result.content[0].type, 'image');
p.stdin.end();
console.log(`ok: mcp server (${tools.length} tools, clean stdout)`);
