import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import jwt from "jsonwebtoken";
import { tools, requestFor } from "../src/tools.js";
import {
  RestreamClient,
  SafeError,
  ConnectionRequired,
} from "../src/api-client.js";
import { brokerResolver } from "../src/broker-client.js";
import { createApp, principalFor } from "../src/http.js";
const tool = (name: string) =>
  tools.find((t) => t.name === `restream_${name}`)!;
const uuid = "2527849f-f961-4b1d-8ae0-8eae4f068327";
const resolved = async () => "test-provider-secret";
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status });
test("registry names unique, explicit schemas and source references", () => {
  assert.equal(new Set(tools.map((t) => t.name)).size, tools.length);
  assert.ok(tools.length > 50);
  for (const t of tools) {
    assert.ok(t.docs.startsWith("https://developers.restream.io/"));
    assert.ok(t.scope);
    assert.equal(t.schema.safeParse({ unexpected: true }).success, false);
  }
});
test("documented endpoint mapping preserves mixed casing and unusual routes", () => {
  assert.equal(
    requestFor(tool("create_event"), {}).path,
    "/v2/user/events/new",
  );
  assert.equal(
    requestFor(tool("get_event_srt_keys"), { eventId: uuid }).path,
    `/v2/user/events/${uuid}/srt/streamKey`,
  );
  assert.equal(
    requestFor(tool("list_audio_backgrounds"), {}).path,
    "/v2/user/studio/audio-backgrounds",
  );
  assert.equal(
    requestFor(tool("get_storage_download_url"), { fileId: "file-123" }).path,
    "/v2/user/storage/files/file-123/download-url",
  );
});
test("query cursors are encoded and pagination constrained", () => {
  const t = tool("list_clip_projects");
  const a = t.schema.parse({ cursor: "a&b=c +/", limit: 100 });
  const url = new URL(requestFor(t, a).path, "https://api.restream.io");
  assert.equal(url.searchParams.get("cursor"), "a&b=c +/");
  assert.equal(url.searchParams.size, 2);
  assert.equal(t.schema.safeParse({ limit: 101 }).success, false);
  assert.equal(
    tool("get_event_chat_history").schema.safeParse({
      eventId: uuid,
      pageToken: "x",
      timestamp: 0,
    }).success,
    false,
  );
});
test("path traversal, arbitrary URL, unknown filters and payloads rejected", () => {
  for (const fileId of [
    "../profile",
    "a/b",
    "%2e%2e",
    "https://evil.invalid",
    "a?x=1",
  ])
    assert.equal(
      tool("get_storage_file").schema.safeParse({ fileId }).success,
      false,
    );
  assert.equal(
    tool("list_channels").schema.safeParse({ filter: "raw" }).success,
    false,
  );
  assert.equal(
    tool("create_event").schema.safeParse({ streamType: "file" }).success,
    false,
  );
  assert.equal(
    tool("create_clip_project").schema.safeParse({
      sourceType: "Event",
      eventId: uuid,
      selectedTimeRange: { startOffsetSeconds: 20, endOffsetSeconds: 10 },
    }).success,
    false,
  );
  assert.equal(
    tool("create_channel").schema.safeParse({ platformId: 49, streamKey: "x" })
      .success,
    false,
  );
  assert.equal(
    tool("update_caption").schema.safeParse({ captionId: uuid }).success,
    false,
  );
});
test("writes disabled before resolving credentials, including mock mode", async () => {
  let calls = 0;
  const c = new RestreamClient({
    resolve: async () => {
      calls++;
      return "x";
    },
    mock: true,
  });
  await assert.rejects(c.call(tool("delete_channel"), { channelId: 1 }), {
    code: "writes_disabled",
  });
  assert.equal(calls, 0);
});
test("auth construction and body omit path identifiers", async () => {
  let seen = false;
  const c = new RestreamClient({
    resolve: resolved,
    fetch: async (u, o) => {
      seen = true;
      assert.equal(
        String(u),
        `https://api.restream.io/v2/user/events/${uuid}/recordings/download-url`,
      );
      assert.equal(
        new Headers(o?.headers).get("authorization"),
        "Bearer test-provider-secret",
      );
      assert.equal(o?.body, JSON.stringify({ fileName: "recording.mp4" }));
      assert.equal(o?.redirect, "error");
      return json({ downloadUrl: "https://example.invalid/file" });
    },
  });
  await c.call(tool("get_recording_download_url"), {
    eventId: uuid,
    fileName: "recording.mp4",
  });
  assert.ok(seen);
});
test("public reads do not resolve or transmit credentials", async () => {
  const c = new RestreamClient({
    resolve: async () => {
      throw Error("unexpected");
    },
    fetch: async (_u, o) => {
      assert.equal(new Headers(o?.headers).get("authorization"), null);
      return json([]);
    },
  });
  assert.deepEqual(await c.call(tool("list_platforms"), {}), []);
});
for (const status of [200, 201, 204])
  test(`parse success ${status}`, async () => {
    const c = new RestreamClient({
      resolve: resolved,
      fetch: async () =>
        status === 204
          ? new Response(null, { status })
          : json({ ok: true }, status),
    });
    assert.deepEqual(
      await c.call(tool("get_profile"), {}),
      status === 204 ? { success: true } : { ok: true },
    );
  });
for (const status of [400, 401, 403, 404, 409, 429, 500])
  test(`normalize ${status} without leaking upstream secrets`, async () => {
    const c = new RestreamClient({
      resolve: resolved,
      retries: 0,
      fetch: async () =>
        json({ error: "Authorization: Bearer secret-password" }, status),
    });
    await assert.rejects(
      c.call(tool("get_profile"), {}),
      (e: unknown) =>
        e instanceof SafeError &&
        e.status === status &&
        !e.message.includes("secret-password"),
    );
  });
test("GET retries transient once; mutations never retry", async () => {
  let n = 0;
  const f: typeof fetch = async () => {
    n++;
    return json({}, 503);
  };
  const c = new RestreamClient({ resolve: resolved, fetch: f, writes: true });
  await assert.rejects(c.call(tool("get_profile"), {}));
  assert.equal(n, 2);
  n = 0;
  await assert.rejects(c.call(tool("create_event"), { streamType: "encoder" }));
  assert.equal(n, 1);
});
test("malformed JSON, DNS errors, timeouts and oversized responses are safe", async () => {
  for (const [f, code] of [
    [async () => new Response("{"), "invalid_response"],
    [
      async () => {
        throw Error("DNS secret-token");
      },
      "transport_error",
    ],
    [
      async (_u: unknown, o: RequestInit) =>
        new Promise<Response>((_r, j) =>
          o.signal?.addEventListener("abort", () =>
            j(Error("timeout secret-token")),
          ),
        ),
      "timeout",
    ],
    [async () => json({ large: "x".repeat(1000) }), "response_too_large"],
  ] as const) {
    const c = new RestreamClient({
      resolve: resolved,
      fetch: f as typeof fetch,
      timeoutMs: 5,
      maxBytes: 100,
    });
    await assert.rejects(
      c.call(tool("get_profile"), {}),
      (e: unknown) =>
        e instanceof SafeError &&
        e.code === code &&
        !e.message.includes("secret-token"),
    );
  }
});
test("broker JWT binds namespace and principal; disconnected returns consent", async () => {
  const config = {
    baseUrl: "https://broker.invalid",
    namespace: "test-ns",
    bearer: "install-secret",
    key: "signing-secret",
  };
  let n = 0;
  const f: typeof fetch = async (u, o) => {
    n++;
    const h = new Headers(o?.headers);
    const payload = jwt.verify(h.get("x-broker-token")!, config.key, {
      algorithms: ["HS256"],
    }) as jwt.JwtPayload;
    assert.equal(payload.principal, "agent-one");
    assert.equal(payload.clientNamespace, "test-ns");
    assert.ok(payload.exp! - payload.iat! <= 60);
    assert.equal(h.get("authorization"), "Bearer install-secret");
    assert.equal(JSON.parse(String(o?.body)).account, "client-a");
    return String(u).endsWith("/token")
      ? json({}, 404)
      : json({ authorizeUrl: "https://api.restream.io/login?state=mock" });
  };
  await assert.rejects(
    brokerResolver("agent-one", "client-a", config, f)(),
    ConnectionRequired,
  );
  assert.equal(n, 2);
});
test("broker rejects unexpected consent host and unconfigured installation", async () => {
  const c = {
    baseUrl: "https://broker.invalid",
    namespace: "ns",
    bearer: "b",
    key: "k",
  };
  await assert.rejects(
    brokerResolver("p", "", c, async (u) =>
      String(u).endsWith("/token")
        ? json({}, 404)
        : json({ authorizeUrl: "https://evil.invalid" }),
    )(),
    { code: "invalid_connect_url" },
  );
  await assert.rejects(brokerResolver("p", "", { ...c, key: "" })(), {
    code: "broker_unconfigured",
  });
});
test("unsigned agent impersonation rejected; standalone identities are isolated", () => {
  const a = { authorization: `Bearer ${"a".repeat(43)}` };
  const b = { authorization: `Bearer ${"b".repeat(43)}` };
  assert.notEqual(principalFor(a, {}).principal, principalFor(b, {}).principal);
  assert.throws(() =>
    principalFor({ ...a, "x-broker-principal": "victim" }, {}),
  );
  const key = "test-key";
  const p = "install:agent";
  const sig = createHmac("sha256", key).update(p).digest("base64url");
  assert.equal(
    principalFor(
      { ...a, "x-broker-principal": p, "x-broker-principal-sig": sig },
      { BROKER_PRINCIPAL_HMAC_KEY: key },
    ).principal,
    p,
  );
  assert.throws(() =>
    principalFor(
      { ...a, "x-broker-principal": "other", "x-broker-principal-sig": sig },
      { BROKER_PRINCIPAL_HMAC_KEY: key },
    ),
  );
  assert.throws(() => principalFor({ ...a, "x-restream-auth": "direct" }, {}));
});
test("stdio initialize, tools/list and mocked transcript call", async () => {
  const c = new Client({ name: "test", version: "1" });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ["dist/index.js"],
    env: { PATH: process.env.PATH ?? "", RESTREAM_MOCK: "true" },
  });
  try {
    await c.connect(transport);
    const list = await c.listTools();
    assert.equal(list.tools.length, tools.length);
    const r = await c.callTool({
      name: "restream_list_event_transcripts",
      arguments: { eventId: uuid },
    });
    assert.equal(r.isError, undefined);
    assert.equal(r.structuredContent?.mode, "mock");
  } finally {
    await c.close();
  }
});
test("HTTP protocol, origin check, config gate and invalid input", async () => {
  const app = createApp({ RESTREAM_MOCK: "true" });
  const s = app.listen(0, "127.0.0.1");
  await new Promise<void>((r) => s.once("listening", r));
  const port = (s.address() as { port: number }).port;
  const base = `http://127.0.0.1:${port}`;
  const c = new Client({ name: "test", version: "1" });
  try {
    assert.equal(
      (
        await fetch(`${base}/mcp`, {
          method: "POST",
          headers: {
            origin: "https://evil.invalid",
            "content-type": "application/json",
          },
          body: "{}",
        })
      ).status,
      403,
    );
    assert.equal(
      (
        await fetch(`${base}/mcp`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: "{}",
        })
      ).status,
      401,
    );
    assert.equal(
      (await fetch(`${base}/.well-known/oauth-authorization-server`)).status,
      404,
    );
    await c.connect(
      new StreamableHTTPClientTransport(new URL(`${base}/mcp`), {
        requestInit: { headers: { Authorization: `Bearer ${"a".repeat(43)}` } },
      }),
    );
    assert.equal((await c.listTools()).tools.length, tools.length);
    assert.equal(
      (await c.callTool({ name: "restream_get_profile", arguments: {} }))
        .structuredContent?.mode,
      "mock",
    );
    assert.equal(
      (
        await c.callTool({
          name: "restream_get_storage_file",
          arguments: { fileId: "../profile" },
        })
      ).isError,
      true,
    );
  } finally {
    await c.close();
    await new Promise<void>((r, j) => s.close((e) => (e ? j(e) : r())));
  }
  const unconfigured = createApp({}).listen(0, "127.0.0.1");
  await new Promise<void>((r) => unconfigured.once("listening", r));
  try {
    const p = (unconfigured.address() as { port: number }).port;
    assert.equal(
      (await fetch(`http://127.0.0.1:${p}/mcp`, { method: "POST" })).status,
      503,
    );
  } finally {
    unconfigured.close();
  }
});
