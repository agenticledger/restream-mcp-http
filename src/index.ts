#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer } from "./hub-server.js";
import { RestreamClient } from "./api-client.js";
import { brokerResolver } from "./broker-client.js";
const server = createServer(
  (account) =>
    new RestreamClient({
      resolve: brokerResolver(process.env.RESTREAM_PRINCIPAL ?? "", account),
      mock: process.env.RESTREAM_MOCK === "true",
      writes: process.env.RESTREAM_ENABLE_WRITES === "true",
    }),
);
await server.connect(new StdioServerTransport());
