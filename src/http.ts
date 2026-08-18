import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { Request, Response, NextFunction } from "express";
import { connectorConfig } from "./config.js";
import { createConnectorServer } from "./server.js";

const app = createMcpExpressApp();
const port = Number(process.env.PORT ?? 3000);

app.get("/health", (_req, res) =>
  res.json({ status: "ok", service: "torq-crm-dr-clean-highlevel" }),
);

function authorize(req: Request, res: Response, next: NextFunction) {
  const key = process.env.MCP_SERVER_API_KEY;
  if (!key) return next();
  if (req.headers.authorization !== `Bearer ${key}`) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
}

app.post("/mcp", authorize, async (req, res) => {
  const server = createConnectorServer(connectorConfig());
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  });
  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch {
    if (!res.headersSent)
      res.status(500).json({
        jsonrpc: "2.0",
        error: { code: -32603, message: "Internal server error" },
        id: null,
      });
  } finally {
    await transport.close();
    await server.close();
  }
});

app.get("/mcp", authorize, (_req, res) =>
  res.status(405).json({
    jsonrpc: "2.0",
    error: { code: -32000, message: "Method not allowed" },
    id: null,
  }),
);
app.delete("/mcp", authorize, (_req, res) =>
  res.status(405).json({
    jsonrpc: "2.0",
    error: { code: -32000, message: "Method not allowed" },
    id: null,
  }),
);

app.listen(port, () =>
  console.log(`HighLevel MCP server listening on port ${port}`),
);
