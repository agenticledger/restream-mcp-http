import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { zodToJsonSchema } from "zod-to-json-schema";
import { tools, type Args } from "./tools.js";
import { ConnectionRequired, SafeError, RestreamClient } from "./api-client.js";
export function createServer(clientFor: (account: string) => RestreamClient) {
  const server = new Server(
    { name: "restream-mcp", version: "1.0.0" },
    { capabilities: { tools: {} } },
  );
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: tools.map((t) => ({
      name: t.name,
      description: `${t.description} Scope: ${t.scope}.${t.write ? " Disabled unless RESTREAM_ENABLE_WRITES=true." : ""}`,
      inputSchema: {
        ...(zodToJsonSchema(t.schema) as object),
        properties: {
          ...((zodToJsonSchema(t.schema) as { properties?: object })
            .properties ?? {}),
          account: {
            type: "string",
            maxLength: 128,
            description:
              "Optional broker account label; defaults to the primary connection.",
          },
        },
        type: "object" as const,
      },
      annotations: {
        readOnlyHint: !t.write,
        destructiveHint: !!t.write,
        idempotentHint: t.method === "GET",
        openWorldHint: true,
      },
    })),
  }));
  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const tool = tools.find((t) => t.name === req.params.name);
    const response = (data: Record<string, unknown>, isError = false) => ({
      content: [{ type: "text" as const, text: JSON.stringify(data) }],
      structuredContent: data,
      ...(isError ? { isError: true } : {}),
    });
    if (!tool)
      return response(
        {
          status: "error",
          code: "unknown_tool",
          message: "Unknown Restream tool.",
        },
        true,
      );
    const { account = "", ...raw } = req.params.arguments ?? {};
    if (
      typeof account !== "string" ||
      account.length > 128 ||
      !/^[-A-Za-z0-9_ ]*$/.test(account)
    )
      return response(
        {
          status: "error",
          code: "invalid_account",
          message: "Invalid broker account label.",
        },
        true,
      );
    const parsed = tool.schema.safeParse(raw);
    if (!parsed.success)
      return response(
        {
          status: "error",
          code: "invalid_arguments",
          message:
            "Arguments do not match the tool schema. Check required fields, allowed values and documented combinations.",
        },
        true,
      );
    const client = clientFor(account);
    try {
      return response({
        status: "ok",
        mode: client.mock ? "mock" : "live",
        sensitive: !!tool.sensitive,
        data: await client.call(tool, parsed.data as Args),
      });
    } catch (e) {
      if (e instanceof ConnectionRequired)
        return response({
          status: "connection_required",
          provider: "restream",
          connectUrl: e.connectUrl,
          message: e.message,
        });
      if (e instanceof SafeError)
        return response(
          {
            status: "error",
            code: e.code,
            message: e.message,
            upstreamStatus: e.status,
          },
          true,
        );
      return response(
        {
          status: "error",
          code: "internal_error",
          message: "Request failed; no credential details are exposed.",
        },
        true,
      );
    }
  });
  return server;
}
