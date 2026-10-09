# Restream MCP full release

Started: 2026-10-09. Status: 56-tool implementation built and hosted on Railway; demo site published; custom DNS and private API proof pending.

## Plan

1. Register and verify Restream OAuth in Connections Broker.
2. Inventory documented REST and Chat API operations, schemas, scopes, pagination, limits, and errors. Build read tools first, then schema-validated writes disabled by default. Include transcripts and Studio assets; assess persistent Chat WebSocket support separately.
3. Implement canonical TypeScript stdio MCP, replaceable provider transport, mock mode, docs, and offline tests.
4. Implement broker-first HTTP wrapper with authenticated per-caller isolation, connection-required responses, and truthful health reporting. Never use a shared fallback identity for unrelated external callers.
5. Run format, lint, typecheck, build, offline protocol/error/security tests and reference review.
6. Create GitHub repository, configure broker identity before Railway deployment, verify HTTP protocol and custom domain.
7. Register canonical source in MCPLive, build and verify docs/ZIP/site, then publish.
8. Provide @hub registry/catalog handoff and recommend broker/steward live proof.

## Auth gate and blockers

- [x] Read workspace CLAUDE.md and full-release skill.
- [x] Read broker INTEGRATION.md and PROVIDERS-STATUS.md; inspect provider schema.
- [x] Confirm no Restream entry in local broker src or status document.
- [x] Permission to modify `/Users/oreph/Desktop/APPs/connections-broker`, granted 2026-10-09 in the user's 'go ahead' reply.
- [x] Restream OAuth application created; credentials installed only in broker production Railway variables on 2026-10-09. Callback acceptance requires consent round-trip.
- [x] Broker provider deployed and user consent confirmed via connection_status (2026-10-09).
- [ ] Private API call and real refresh-token rotation proof: pending; mocked exchange/rotation tests pass.

The broker deployment `d506ccc2-ca8e-4203-a352-9535d0cd196a` is SUCCESS. Production `/connect` now returns the expected Restream authorization URL. User consent/callback confirmed by platform connection_status. The platform connection is not yet bound to the new MCP namespace; private API proof remains pending. Consent state and secrets are not stored in this checklist.

## Broker change (implemented and pushed; live readiness pending)

Broker commit `24f2f66` pushed to `origin/main` on 2026-10-09. TypeScript build passed; 48 unit tests passed, 0 failed. New tests cover consent parameters, HTTP Basic/form token exchange, expiry parsing, and rotated refresh tokens using mocked fetch. Database integration suites skipped explicitly. Subsequent deployment and user consent were confirmed as recorded above. Owner provided app credentials and authorized Railway installation; variables saved successfully. No secrets recorded in source or this checklist.

Add this provider row to `src/providers.ts`, add tests, and update `PROVIDERS-STATUS.md` with evidence-based status:

```ts
{
  name: "restream",
  kind: "oauth",
  auth_url: "https://api.restream.io/login",
  token_url: "https://api.restream.io/oauth/token",
  auth_style: "basic_form",
  scopes: null, // Restream documents selection in application settings; verify consent grants.
  has_refresh: true,
  token_field: "access_token",
  refresh_field: "refresh_token",
  extra_auth_params: null,
  credentials_key: null,
  enabled: true,
}
```

Broker environment: `RESTREAM_CLIENT_ID`, `RESTREAM_CLIENT_SECRET`.
Restream app redirect URI: `https://connectionsbroker.agenticledger.ai/oauth/callback`.
Select only scopes needed by the final endpoint inventory in Restream application settings. Do not put provider credentials into either MCP project.

## Documentation evidence

- Setup and app-level scope selection: https://developers.restream.io/guide/getting-started
- Authorization URL: https://developers.restream.io/authentication/authorize-dialog
- Token exchange, HTTP Basic + form body: https://developers.restream.io/authentication/code-exchange
- Rotating access/refresh token pairs: https://developers.restream.io/authentication/refreshing-tokens
- Official MCP comparison: https://developers.restream.io/mcp-server
- Transcript retrieval: https://developers.restream.io/events/events-recording-transcriptions
- Studio caption creation: https://developers.restream.io/studio/captions/studio-caption-create
- Chat reply: https://developers.restream.io/chat/reply

Documentation checked 2026-10-09; inventory completed for the 56 implemented tools. Public platforms API verified live; private endpoints and real refresh rotation remain unverified.

## Release evidence

- [x] Reference MCP inspection: QBO broker client and HTTP identity handling; YouTube Studio stdio structure. Legacy shared fallback identities and in-MCP refresh-token handling must not be copied.
- [x] API inventory and schemas
- [x] Stdio scaffold/client/tools
- [x] README and interactive docs
- [x] Offline tests and security review
- [x] HTTP wrapper and protocol tests
- [x] GitHub repository
- [x] Railway deployment and health verification
- [ ] Custom domain and TLS verification
- [x] MCPLive registry, docs, ZIP, build and publication
- [x] Live public read-only provider proof (private reads remain pending)
- [x] Platform handoff prepared for the owner (registration is performed by @hub)

Tool count: 56 (39 read, 17 write; includes 2 bounded WebSocket observers).

- Canonical source: LIVESTDIOMCPS/restream/mcp-server.
- HTTP repo: https://github.com/agenticledger/restream-mcp-http (initial commit 944b18e).
- Railway service: d761e247-539d-4b4a-b2a9-f0f2dfacb19f, project 3230ac49-2b3c-4e8f-a266-3fcf93b0b51f, production c511b016-571a-4176-8e13-e23afdd586c9.
- Initial deployment e02efbfd-b5ec-4aa9-9a56-3053e2db6fdc: SUCCESS.
- Verified endpoint: https://restream-mcp-http-production.up.railway.app/mcp.
- /health: broker-first, brokerConfigured=true, writesEnabled=false, mode=live, toolCount=56.
- Live MCP initialize and tools/list passed. restream_list_platforms returned 62 platforms.
- A fresh isolated identity's get_profile returned connection_required with api.restream.io consent URL and no isError.
- Offline suite: 24 passed, 0 failed in both packages. TypeScript build/typecheck and Prettier lint passed. Production dependency audit: 0 vulnerabilities.
- Desktop/mobile browser checks: search, write filter (17), mock preview, landing link and hero buttons passed; no JS errors, no mobile document overflow after fix.
- Screenshots: FileStorage/Permanent/restream-docs-desktop.png and restream-docs-mobile.png in agent Files.
- All 56 documentation examples validated against tool schemas.
- Public API facts only: Chat API is receive-only, despite the initial comparison claiming reply support. No send-reply tool is implemented. REST event edit/reschedule/delete, Studio playback or live overlay toggles are not documented and are not invented.

## Custom-domain blocker

Railway custom domain created; verification currently false. No Namecheap key in session environment or workspace references. Owner asked for a key or manual record installation.

- CNAME restreammcp -> restream-mcp-http-production.up.railway.app
- TXT _railway-verify.restreammcp -> railway-verify=ff79bbd0ed0c0d3de7a502b6bfb415dd1f67a715222abe51924d4c248327023b

Keep the verified Railway endpoint in site/registration until custom DNS and TLS pass.

## Platform identity handoff requirement

Bind the agent's existing Restream connection to namespace restream-mcp-prod, principal <instanceId>:<agentId>. Gateway must sign X-Broker-Principal with HMAC-SHA256/base64url using BROKER_PRINCIPAL_HMAC_KEY provisioned through secret configuration. No unsigned principal or shared fallback is accepted. A standalone client instead retains its private random 32-byte base64url Bearer identity. Broker install identity is gitignored in the HTTP project's .env (0600); do not include it in ZIPs or handoff text.


## Final publication verification

HTTP commit 4e87313 deployed successfully as Railway deployment d0fba9e4-4fc9-46bd-9433-69d42b361165. MCPLive commit b65bd51 deployed successfully; public docs, tools.json, and ZIP returned HTTP 200. Downloaded ZIP integrity passed. Published browser checks showed all 56 tools, no JS errors, and no horizontal overflow at 1365px and 390px. The demo domain currently responds through Railway despite older workspace documentation describing Cloudflare Pages. Custom-domain verification remains false.
