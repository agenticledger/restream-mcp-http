# Restream MCP

TypeScript MCP for Restream's documented REST API and bounded WebSocket observations. OAuth credentials and refresh logic live exclusively in Connections Broker. Supports stdio and stateless Streamable HTTP.

## Install and run

Node 22 or newer is required.

```sh
npm ci
npm run build
RESTREAM_MOCK=true npm start
```

For a local MCP client, configure `command: "node"`, `args: ["/absolute/path/to/dist/index.js"]`, and the environment below. stdout contains only MCP protocol messages.

Live stdio needs `BROKER_BASE_URL`, `BROKER_CLIENT_NAMESPACE`, `BROKER_INSTALL_BEARER`, `BROKER_JWT_KEY`, and a stable `RESTREAM_PRINCIPAL`. Obtain installation credentials from broker `/register` and keep them out of source control. Optional tool argument `account` selects a broker account label. The initial call returns `connection_required` with a one-time OAuth consent URL. Approve it and retry. No OAuth app secret, refresh token, or provider credential fallback is supported.

## Hosted HTTP

Verified endpoint: `https://restream-mcp-http-production.up.railway.app/mcp`. Custom domain `restreammcp.agenticledger.ai` awaits DNS verification (see BUILD_CHECKLIST.md).

Set the broker installation variables before starting `npm run start:http`. Set `HOST=0.0.0.0` for Railway; local default is `127.0.0.1`. `GET /health` reports configuration, write flag, mode, and tool count. No OAuth callback or authorization-server metadata is served.

**Standalone clients:** generate a private 32-byte identity using `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`. Configure it as `Authorization: Bearer <identity>`. Keep it private and stable. The MCP hashes it to derive a unique caller principal; it is NOT a Restream provider token. Losing it loses access to that broker namespace/principal. No anonymous shared fallback exists.

**Platform gateway:** supply `X-Broker-Principal: <instanceId>:<agentId>` and `X-Broker-Principal-Sig`, an HMAC-SHA256 of that exact principal encoded base64url using the server's `BROKER_PRINCIPAL_HMAC_KEY`, plus a nonempty Bearer header. Unsigned/invalid principal headers are rejected. The gateway must connect the same principal within `restream-mcp-prod`, using the broker's supported binding flow. A connection in the platform's own namespace is not automatically an MCP connection. Share the HMAC secret through secret configuration, never a public catalog.

Optional direct-provider testing is off by default. Only when `RESTREAM_ALLOW_DIRECT_TOKEN=true`, requests with `X-Restream-Auth: direct` treat Authorization as a provider access token for that request. No provider token is stored. Production release keeps this disabled.

Origins are denied unless explicitly listed in comma-separated `ALLOWED_ORIGINS`; native server-to-server clients normally omit Origin. HTTP requests are stateless and capped at 128 KB. The server admits at most 100 concurrent MCP requests. GET/DELETE on `/mcp` return 405; no persistent SSE session is offered.

## Tools and permissions

See `docs/index.html` for all tool schemas, examples, mock outputs, source links and searchable previews. `docs/tools.json` provides machine-readable definitions. Every tool accepts optional `account` in addition to its provider arguments.

Scopes are selected in the Restream OAuth application settings: profile.read, channels.read/write, stream.read/write, chat.read, storage.read, clips.read/write, studio.read/write, as needed for the tools enabled. Scope changes may require reconnection. Account plan limits still apply. Writes require `RESTREAM_ENABLE_WRITES=true` and should be reviewed by the calling client; they default off even in mock mode.

REST requests go only to `https://api.restream.io`. Timeout is 15 seconds, response limit 2 MB. GET requests retry one transient 429/5xx response; POST/PATCH/DELETE never automatically retry. Errors return safe codes and guidance, without upstream error bodies. List tools return one page with provider pagination intact; clip limit caps at 100, chat pageSize at 1000, event-history limit at 100. Caps not documented by Restream are local safety limits.

## Limitations

- Chat WebSocket API is receive-only. `observe_chat` reports incoming messages, connection status, and replies/relays performed elsewhere; it cannot send replies.
- WebSocket observations close after 1–20 seconds or 1–100 events, capped at 1 MB. They are not durable monitoring. Repeated calls may receive replayed streaming updates.
- Transcript retrieval returns existing transcript status and download URLs. It does not generate transcriptions or fetch arbitrary URLs.
- Stream keys, chat embed URLs and temporary download URLs are sensitive output. Only explicitly named retrieval tools expose them intentionally; no error logs print secrets.
- Creating captions/tickers/QR codes manages assets; it does not toggle them live. No documented Studio playback/start/stop endpoint is invented.
- The official hosted Restream MCP has some event operations absent from the public REST documentation. Event editing, rescheduling and deletion are not exposed here.
- Destination creation has a provider-defined platform subset; destination deletion only applies to scheduled events.
- Mock mode returns clearly labeled synthetic fixtures and never contacts the broker/provider. Generic fixtures do not imply a verified upstream response shape.

## Verification

```sh
npm run format
npm run lint
npm run typecheck
npm run build
npm test
npx tsx scripts/build-docs.ts
```

Tests use mocked upstream fetch and real local SDK stdio/HTTP transports. Live provider writes are not part of release testing. For live proof: check `/health`, initialize/list tools, call `restream_get_profile`, complete any `connection_required` consent, retry profile, then list channels and read-only Studio/transcript resources if available. Verify expired-token refresh separately. Do not claim all tool endpoints verified from one successful profile call. Follow BUILD_CHECKLIST.md for exact deployment and proof status.

Troubleshooting: 401 → reconnect; 403 → verify scopes/plan; 404 → check IDs or absence of data; 409 → inspect existing clip project before regenerating; 429 → wait. After a write timeout, inspect resulting state before retrying.
