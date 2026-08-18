import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { connectorConfig } from "./config.js";
import { createConnectorServer } from "./server.js";

const server = createConnectorServer(connectorConfig());
await server.connect(new StdioServerTransport());
