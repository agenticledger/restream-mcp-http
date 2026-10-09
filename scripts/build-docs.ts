import { writeFileSync } from "node:fs";
import { tools } from "../src/tools.js";
import { zodToJsonSchema } from "zod-to-json-schema";
import { mockResult } from "../src/api-client.js";
function example(schema: unknown): unknown {
  const s = schema as {
    default?: unknown;
    enum?: unknown[];
    type?: string;
    format?: string;
    properties?: Record<string, unknown>;
    required?: string[];
    items?: unknown;
    minimum?: number;
    anyOf?: unknown[];
  };
  if (s.default !== undefined) return s.default;
  if (s.enum) return s.enum[0];
  if (s.anyOf) return example(s.anyOf[0]);
  if (s.type === "object")
    return Object.fromEntries(
      (s.required ?? []).map((k) => [k, example(s.properties?.[k])]),
    );
  if (s.type === "array") return [example(s.items)];
  if (s.type === "boolean") return false;
  if (s.type === "number" || s.type === "integer")
    return Math.max(1, s.minimum ?? 1);
  return s.format === "uuid"
    ? "2527849f-f961-4b1d-8ae0-8eae4f068327"
    : s.format === "uri"
      ? "https://example.com"
      : s.format === "date-time"
        ? "2026-12-01T15:00:00Z"
        : "example";
}
const data = tools.map((t) => {
  const schema = zodToJsonSchema(t.schema);
  let args = example(schema) as Record<string, unknown>;
  if (t.name === "restream_create_clip_project")
    args = {
      sourceType: "VideoStorageFile",
      videoStorageFileId: "2527849f-f961-4b1d-8ae0-8eae4f068327",
    };
  if (t.name === "restream_create_channel")
    args = { platformId: 29, streamUrl: "rtmp://example.com/live" };
  return {
    ...t,
    schema,
    example: args,
    mock: { status: "ok", mode: "mock", data: mockResult(t, args) },
  };
});
writeFileSync(
  new URL("../docs/tools.json", import.meta.url),
  JSON.stringify(data, null, 2),
);
const esc = (s: string) =>
  s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
const cards = data
  .map(
    (t) =>
      `<article data-search="${esc(t.name + " " + t.description + " " + t.scope)}" data-write="${!!t.write}"><details><summary><span class="method">${t.socket ? "WS" : t.method}</span><strong>${t.name}</strong><span class="badge">${t.write ? "Write" : "Read"}</span></summary><p>${esc(t.description)}</p><p><code>${esc(t.path || "Bounded WebSocket observation")}</code> · <a href="${t.docs}">Provider reference ↗</a></p><p>Required scope: <code>${t.scope}</code>${t.sensitive ? " · Returns sensitive stream credentials or URLs." : ""}</p><h3>Input schema</h3><pre>${esc(JSON.stringify(t.schema, null, 2))}</pre><h3>Example arguments</h3><pre>${esc(JSON.stringify(t.example, null, 2))}</pre><h3>Mock output</h3><pre>${esc(JSON.stringify(t.mock, null, 2))}</pre><button class="preview" data-tool="${t.name}">Preview mock request</button></details></article>`,
  )
  .join("\n");
writeFileSync(
  new URL("../docs/index.html", import.meta.url),
  `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Restream MCP — Finance MCPs Hub</title><style>
:root{--bg-primary:#0a0e1a;--bg-secondary:#0f1629;--bg-card:#111827;--bg-code:#0d1117;--text-primary:#f1f5f9;--text-secondary:#aab8cb;--accent-green:#4ade80;--border-color:#2a3850}*{box-sizing:border-box}body{margin:0;background:var(--bg-primary);color:var(--text-primary);font:15px/1.65 Inter,-apple-system,BlinkMacSystemFont,sans-serif}main{max-width:1100px;margin:auto;padding:52px 28px}a{color:var(--accent-green)}nav{display:flex;gap:24px;flex-wrap:wrap;font-size:13px}header{padding:48px 0;border-bottom:1px solid var(--border-color)}.eyebrow{color:var(--accent-green);letter-spacing:.12em;text-transform:uppercase;font-size:12px}h1{font-size:clamp(44px,7vw,80px);line-height:1.1;margin:18px 0}header p{max-width:680px;font-size:19px;color:var(--text-secondary)}h2{font-size:28px;margin-top:48px}h3{font-size:15px}p{color:var(--text-secondary)}code,pre{font:13px/1.6 'JetBrains Mono',monospace}pre{padding:18px;background:var(--bg-code);overflow:auto;border-radius:5px}input,select,button{font:inherit;color:var(--text-primary);background:var(--bg-card);border:1px solid var(--border-color);border-radius:5px;padding:10px 14px}button{cursor:pointer}button:hover{border-color:var(--accent-green)}:focus-visible{outline:3px solid var(--accent-green);outline-offset:3px}.filters{display:flex;gap:12px;flex-wrap:wrap;margin-bottom:20px}.filters input{flex:1;min-width:200px}article{border-bottom:1px solid var(--border-color)}summary{padding:20px 0;cursor:pointer;display:flex;align-items:center;gap:14px}summary strong{font:13px 'JetBrains Mono',monospace;overflow-wrap:anywhere}.method{color:var(--accent-green);width:55px;font:12px monospace;flex-shrink:0}.badge{margin-left:auto;font-size:12px;color:var(--text-secondary)}details[open]{padding-bottom:24px}.note{border-left:3px solid var(--accent-green);padding-left:18px}.setup{display:grid;grid-template-columns:1fr 1fr;gap:28px}#preview{border:1px solid var(--border-color);padding:22px;margin:24px 0}footer{padding:35px 0;color:var(--text-secondary);font-size:13px}@media(max-width:650px){main{padding:24px 16px}.setup{grid-template-columns:1fr}summary{gap:7px}summary strong{font-size:11px}.badge{display:none}}[hidden]{display:none!important}
</style></head><body><main><nav><a href="/">Finance MCPs Hub</a><a href="#setup">Connect</a><a href="#reference">Tools</a><a href="https://developers.restream.io/guide/getting-started">Restream API ↗</a></nav><header class="hero"><div class="eyebrow">Streaming & media · MCP reference</div><h1>Restream MCP</h1><p>Prepare broadcasts, inspect recordings and transcripts, and manage Studio assets through ${tools.length} documented API tools.</p><p><code>https://restreammcp.agenticledger.ai/mcp</code></p></header><section id="setup"><h2>Connect once. Work through your agent.</h2><p>Provider credentials stay in the Connections Broker. Your first authenticated private tool call returns a consent link when Restream is not connected.</p><div class="setup"><div><h3>Hosted · Streamable HTTP</h3><p>Use a private random 32-byte base64url Bearer identity. Keep it stable and private: it identifies your broker connection. Generate one locally:</p><pre>node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"</pre><p>Set the endpoint above and <code>Authorization: Bearer &lt;your-private-identity&gt;</code> in your MCP client. Gateway principals require an HMAC signature; see the README.</p></div><div><h3>Local · stdio</h3><pre>npm ci
npm run build
RESTREAM_MOCK=true npm start</pre><p>For live stdio, configure the broker install identity and <code>RESTREAM_PRINCIPAL</code>. No provider client secret or refresh token belongs in the MCP.</p></div></div><p class="note">Writes are disabled by default. The operator must enable <code>RESTREAM_ENABLE_WRITES=true</code> before any mutation. Chat tools observe incoming events; they cannot send replies. Mock previews never contact Restream.</p></section><section id="reference"><h2>Tool reference</h2><div class="filters"><input id="search" type="search" aria-label="Search tools" placeholder="Search tools, scopes, or capabilities"><select id="access" aria-label="Filter access"><option value="all">All tools</option><option value="false">Read tools</option><option value="true">Write tools</option></select></div><p id="count" aria-live="polite">${tools.length} tools</p><div id="preview" hidden><h3>Mock request preview</h3><pre id="request"></pre><button id="copy">Copy request</button><p id="copied" aria-live="polite"></p></div>${cards}</section><section><h2>Limits and verification</h2><p>REST reads use a 15-second timeout and a 2 MB response cap. Paginated tools return one page with provider cursors. WebSocket tools observe up to 20 seconds or 100 messages, then close. Account plans and granted scopes determine which calls succeed.</p><p>Offline fixtures are synthetic. The initial release verifies protocol behavior and connection handling separately from live provider operations. No live write operations are run during release validation. Transcript tools return available download links; they do not generate or fetch transcript files.</p><p>The public REST API does not document all actions available through Restream’s official MCP, including editing or deleting events. This server exposes documented APIs only.</p></section><footer>Finance MCPs Hub · Restream API documentation checked October 9, 2026.</footer></main><script>
const tools=${JSON.stringify(data.map((t) => ({ name: t.name, args: t.example }))).replaceAll("<", "\\u003c")};
const search=document.getElementById('search'),access=document.getElementById('access');
function filter(){let count=0;document.querySelectorAll('article').forEach(a=>{a.hidden=!a.dataset.search.toLowerCase().includes(search.value.toLowerCase())||(access.value!=='all'&&access.value!==a.dataset.write);if(!a.hidden)count++;});document.getElementById('count').textContent=count+' tools';}search.addEventListener('input',filter);access.addEventListener('change',filter);
document.querySelectorAll('.preview').forEach(b=>b.addEventListener('click',()=>{const t=tools.find(t=>t.name===b.dataset.tool);document.getElementById('request').textContent=JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{name:t.name,arguments:t.args}},null,2);document.getElementById('preview').hidden=false;document.getElementById('preview').scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});}));document.getElementById('copy').addEventListener('click',async()=>{try{await navigator.clipboard.writeText(document.getElementById('request').textContent);document.getElementById('copied').textContent='Copied';}catch{document.getElementById('copied').textContent='Select the request text to copy.';}});
</script></body></html>`,
);
console.log(`Generated docs for ${tools.length} tools`);
