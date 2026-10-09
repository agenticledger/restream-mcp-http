import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { pathToFileURL } from "node:url";
import express from "express";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createServer } from "./hub-server.js";
import { RestreamClient } from "./api-client.js";
import { brokerConfig, brokerResolver, configured } from "./broker-client.js";
import { tools } from "./tools.js";
export function principalFor(
  headers: Record<string, unknown>,
  env: NodeJS.ProcessEnv = process.env,
): { principal: string; directToken?: string } {
  const auth = headers.authorization;
  if (typeof auth !== "string" || !/^Bearer [^\s]+$/.test(auth))
    throw new Error("Bearer required");
  const bearer = auth.slice(7);
  if (bearer.length > 4096) throw new Error("Invalid Bearer");
  if (headers["x-restream-auth"] === "direct") {
    if (env.RESTREAM_ALLOW_DIRECT_TOKEN !== "true")
      throw new Error("Direct token mode disabled");
    return { principal: "direct", directToken: bearer };
  }
  const raw = headers["x-broker-principal"];
  if (raw !== undefined) {
    const sig = headers["x-broker-principal-sig"];
    const key = env.BROKER_PRINCIPAL_HMAC_KEY;
    if (
      typeof raw !== "string" ||
      raw.length > 256 ||
      !/^[-A-Za-z0-9_:]+$/.test(raw) ||
      !key ||
      typeof sig !== "string"
    )
      throw new Error("Signed principal required");
    const expected = createHmac("sha256", key).update(raw).digest("base64url");
    if (
      sig.length !== expected.length ||
      !timingSafeEqual(Buffer.from(sig), Buffer.from(expected))
    )
      throw new Error("Invalid principal signature");
    return { principal: raw };
  }
  // This is a private caller-generated identity, not a provider token. Keep stable across sessions.
  if (!/^[A-Za-z0-9_-]{43,256}$/.test(bearer))
    throw new Error("Use a private random 32-byte base64url Bearer identity");
  return {
    principal: `standalone:${createHash("sha256").update(bearer).digest("hex")}`,
  };
}
export function createApp(env: NodeJS.ProcessEnv = process.env) {
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "128kb" }));
  const config = brokerConfig(env);
  const origins = new Set(
    (env.ALLOWED_ORIGINS ?? "").split(",").filter(Boolean),
  );
  app.get("/health", (_req, res) =>
    res.json({
      status: "ok",
      name: "restream-mcp",
      version: "1.0.0",
      authModel: "broker-first",
      provider: "restream",
      providerKind: "oauth",
      brokerConfigured: configured(config),
      clientNamespace: config.namespace,
      principalHeader: "x-broker-principal",
      signedPrincipalRequired: true,
      toolCount: tools.length,
      writesEnabled: env.RESTREAM_ENABLE_WRITES === "true",
      mode: env.RESTREAM_MOCK === "true" ? "mock" : "live",
    }),
  );
  app.use("/mcp", (req, res, next) => {
    if (req.headers.origin && !origins.has(req.headers.origin)) {
      res.status(403).json({ error: "origin_denied" });
      return;
    }
    if (!configured(config) && env.RESTREAM_MOCK !== "true") {
      res.status(503).json({ error: "broker_unconfigured" });
      return;
    }
    try {
      res.locals.identity = principalFor(req.headers, env);
    } catch {
      res.status(401).json({
        error: "invalid_identity",
        message:
          "Use a private random Bearer identity, or an authenticated gateway principal with HMAC signature.",
      });
      return;
    }
    next();
  });
  let active = 0;
  app.post("/mcp", async (req, res) => {
    if (active >= 100) {
      res.status(429).json({ error: "server_busy" });
      return;
    }
    active++;
    const identity = res.locals.identity as {
      principal: string;
      directToken?: string;
    };
    const server = createServer(
      (account) =>
        new RestreamClient({
          resolve: identity.directToken
            ? async () => identity.directToken!
            : brokerResolver(identity.principal, account, config),
          mock: env.RESTREAM_MOCK === "true",
          writes: env.RESTREAM_ENABLE_WRITES === "true",
        }),
    );
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    let closed = false;
    const close = () => {
      if (closed) return;
      closed = true;
      active--;
      void transport.close();
      void server.close();
    };
    res.on("close", close);
    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch {
      if (!res.headersSent)
        res.status(500).json({ error: "mcp_request_failed" });
      close();
    }
  });
  app.all("/mcp", (_req, res) => res.status(405).set("Allow", "POST").end());
  app.use(
    (
      err: unknown,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => {
      void err;
      res.status(400).json({ error: "invalid_request" });
    },
  );
  return app;
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  createApp().listen(
    Number(process.env.PORT ?? 3100),
    process.env.HOST ?? "127.0.0.1",
    () => console.error("Restream MCP HTTP listening"),
  );
}
