import WebSocket from "ws";
import { requestFor, type Args, type Tool } from "./tools.js";
export class SafeError extends Error {
  constructor(
    public code: string,
    message: string,
    public status?: number,
  ) {
    super(message);
  }
}
export class ConnectionRequired extends Error {
  constructor(public connectUrl: string) {
    super("Connect Restream, then retry this tool.");
  }
}
export type CredentialResolver = () => Promise<string>;
export interface ClientOptions {
  resolve: CredentialResolver;
  fetch?: typeof fetch;
  mock?: boolean;
  writes?: boolean;
  timeoutMs?: number;
  maxBytes?: number;
  retries?: number;
}
export class RestreamClient {
  readonly mock: boolean;
  readonly writes: boolean;
  constructor(private options: ClientOptions) {
    this.mock = !!options.mock;
    this.writes = !!options.writes;
  }
  async call(tool: Tool, args: Args): Promise<unknown> {
    if (tool.write && !this.writes)
      throw new SafeError(
        "writes_disabled",
        "Set RESTREAM_ENABLE_WRITES=true on the server to permit mutations.",
      );
    if (this.mock) return mockResult(tool, args);
    const token = tool.public ? "" : await this.options.resolve();
    if (tool.socket)
      return this.observe(
        tool.socket,
        token,
        Number(args.durationSeconds),
        Number(args.maxEvents),
      );
    const req = requestFor(tool, args);
    if (
      !req.path.startsWith("/v2/") ||
      req.path.split("?")[0].includes("..") ||
      req.path.split("?")[0].includes("\\")
    )
      throw new SafeError("invalid_path", "Invalid API path.");
    const url = new URL(req.path, "https://api.restream.io");
    if (url.origin !== "https://api.restream.io")
      throw new SafeError("invalid_host", "Invalid API host.");
    const tries = tool.method === "GET" ? (this.options.retries ?? 1) + 1 : 1;
    for (let attempt = 0; attempt < tries; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(
        () => controller.abort(),
        this.options.timeoutMs ?? 15000,
      );
      try {
        const headers: Record<string, string> = { Accept: "application/json" };
        if (token) headers.Authorization = `Bearer ${token}`;
        if (req.body) headers["Content-Type"] = "application/json";
        const response = await (this.options.fetch ?? fetch)(url, {
          method: tool.method,
          headers,
          body: req.body ? JSON.stringify(req.body) : undefined,
          signal: controller.signal,
          redirect: "error",
        });
        if (
          [429, 500, 502, 503, 504].includes(response.status) &&
          attempt + 1 < tries
        ) {
          await response.body?.cancel();
          clearTimeout(timer);
          await new Promise((r) => setTimeout(r, 250));
          continue;
        }
        if (!response.ok) {
          await response.body?.cancel();
          throw new SafeError(
            `upstream_${response.status}`,
            statusMessage(response.status),
            response.status,
          );
        }
        if (response.status === 204) return { success: true };
        const cap = this.options.maxBytes ?? 2_000_000;
        if (Number(response.headers.get("content-length") ?? 0) > cap) {
          await response.body?.cancel();
          throw new SafeError(
            "response_too_large",
            "Response exceeds 2 MB. Use a smaller page or narrower query.",
          );
        }
        const reader = response.body?.getReader();
        const chunks: Uint8Array[] = [];
        let size = 0;
        if (reader)
          while (true) {
            const r = await reader.read();
            if (r.done) break;
            size += r.value.length;
            if (size > cap) {
              await reader.cancel();
              throw new SafeError(
                "response_too_large",
                "Response exceeds configured limit. Use a smaller page.",
              );
            }
            chunks.push(r.value);
          }
        let result: unknown;
        try {
          result = JSON.parse(Buffer.concat(chunks).toString("utf8"));
        } catch {
          throw new SafeError(
            "invalid_response",
            "Restream returned malformed JSON.",
          );
        }
        return result;
      } catch (e) {
        if (e instanceof SafeError) throw e;
        throw new SafeError(
          controller.signal.aborted ? "timeout" : "transport_error",
          controller.signal.aborted
            ? "Restream request timed out. Retry a read; check write outcome before retrying."
            : "Unable to reach Restream securely. No request or credential details are logged.",
        );
      } finally {
        clearTimeout(timer);
      }
    }
    throw new SafeError("transport_error", "Request failed.");
  }
  private observe(
    kind: "chat" | "streaming",
    token: string,
    seconds: number,
    maxEvents: number,
  ): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const events: unknown[] = [];
      let bytes = 0;
      let opened = false;
      let done = false;
      const ws = new WebSocket(
        `wss://${kind}.api.restream.io/ws?accessToken=${encodeURIComponent(token)}`,
        { maxPayload: 256000, handshakeTimeout: 10000, followRedirects: false },
      );
      const finish = (error?: SafeError) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        if (timerRef) clearTimeout(timerRef);
        ws.terminate();
        if (error) reject(error);
        else
          resolve({
            events,
            windowSeconds: seconds,
            truncated: events.length >= maxEvents,
          });
      };
      const timer = setTimeout(
        () =>
          finish(
            opened
              ? undefined
              : new SafeError("timeout", "WebSocket did not connect in time."),
          ),
        seconds * 1000 + 10000,
      );
      ws.on("open", () => {
        opened = true;
        clearTimeout(timer);
        timerRef = setTimeout(() => finish(), seconds * 1000);
      });
      let timerRef: ReturnType<typeof setTimeout> | undefined;
      ws.on("message", (data) => {
        try {
          bytes += Buffer.byteLength(data.toString());
          if (bytes > 1_000_000)
            return finish(
              new SafeError(
                "response_too_large",
                "WebSocket event window exceeds 1 MB.",
              ),
            );
          events.push(JSON.parse(data.toString()));
          if (events.length >= maxEvents) finish();
        } catch {
          finish(
            new SafeError("invalid_response", "Malformed WebSocket event."),
          );
        }
      });
      ws.on("error", () =>
        finish(
          new SafeError(
            "transport_error",
            "Restream WebSocket failed; verify scopes and connection.",
          ),
        ),
      );
      ws.on("close", () => {
        if (timerRef) clearTimeout(timerRef);
        finish();
      });
    });
  }
}
function statusMessage(status: number) {
  if (status === 401)
    return "Restream rejected the token. Reconnect through the broker.";
  if (status === 403)
    return "Restream denied access. Check app scopes and account plan; reconnect after changing scopes.";
  if (status === 404)
    return "Resource not found or data unavailable; events without streams may have no analytics.";
  if (status === 409)
    return "Restream reported a conflict; clip sources may already be processed. Inspect existing state before retrying.";
  if (status === 429)
    return "Restream rate limit reached. Wait before retrying.";
  if (status >= 500)
    return "Restream service error. Inspect write outcome before retrying.";
  return "Restream rejected the request. Check identifiers, fields and endpoint documentation.";
}
export function mockResult(tool: Tool, args: Args): unknown {
  if (tool.name === "restream_get_profile")
    return { id: 100, username: "mock-user", email: "mock@example.invalid" };
  if (tool.name === "restream_list_channels")
    return {
      channels: [
        {
          id: 123456,
          platformId: 29,
          displayName: "Mock RTMP",
          channelUrl: "https://example.invalid/live",
        },
      ],
    };
  if (tool.name === "restream_list_event_transcripts")
    return {
      transcriptions: [
        {
          id: "7f3c9a4e-1b2d-4c5f-8a6b-9d0e1f2a3b4c",
          status: "Completed",
          fileName: "mock-recording.mp4",
          downloadUrl: "https://example.invalid/mock-transcript.txt",
        },
      ],
    };
  if (tool.socket)
    return {
      events: [],
      windowSeconds: args.durationSeconds,
      truncated: false,
    };
  if (tool.method === "DELETE") return { success: true };
  return {
    fixture: true,
    tool: tool.name,
    notice: "Synthetic offline response; not live provider data.",
  };
}
