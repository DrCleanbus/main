import assert from "node:assert/strict";
import test from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createConnectorServer } from "../src/server.js";

test("publishes update_calendar_service_time in the MCP action catalog", async () => {
  const server = createConnectorServer({ accessToken: "test-token" });
  const client = new Client({ name: "catalog-test", version: "1.0.0" });
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();

  await Promise.all([
    server.connect(serverTransport),
    client.connect(clientTransport),
  ]);
  try {
    const catalog = await client.listTools();
    assert.deepEqual(
      catalog.tools.map(({ name }) => name),
      [
        "search_users",
        "list_calendars",
        "get_calendar",
        "update_calendar",
        "ensure_user_on_matching_calendars",
        "update_calendar_service_time",
      ],
    );
  } finally {
    await client.close();
    await server.close();
  }
});
