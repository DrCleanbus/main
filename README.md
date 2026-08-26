# Torq CRM – Dr. Clean HighLevel MCP connector

This deployable Streamable HTTP MCP server adds safe HighLevel user and calendar operations without embedding connection credentials. Its public MCP endpoint is `/mcp`, and `/health` can be used by a hosting service.

## Configuration

Supply secrets through the deployment's secret store. `GHL_ACCESS_TOKEN` is required. `GHL_COMPANY_ID`, `GHL_LOCATION_ID`, and `GHL_BASE_URL` are optional connection defaults. The token requires `users.readonly`, `calendars.readonly`, and `calendars.write` scopes.

## Easiest deployment for a non-developer (Render)

1. Rotate any token that has been pasted into chat. In HighLevel, create a new Private Integration token with `users.readonly`, `calendars.readonly`, and `calendars.write`.
2. Put this project in a private GitHub repository. Do **not** add a `.env` file.
3. Create a [Render](https://render.com) account, choose **New > Blueprint**, connect the repository, and approve `render.yaml`.
4. Render will ask for `GHL_ACCESS_TOKEN`. Paste the **new** HighLevel token into that secret field and deploy. This is the safe place to paste it.
5. In the Render service, open **Environment** and copy the generated `MCP_SERVER_API_KEY` into a password manager.
6. When deployment is green, the MCP URL is `https://YOUR-RENDER-SERVICE.onrender.com/mcp`. Configure your agent with that URL and send `Authorization: Bearer YOUR_MCP_SERVER_API_KEY` as its MCP authentication header.
7. Check `https://YOUR-RENDER-SERVICE.onrender.com/health`; it should show `{"status":"ok",...}`. Never put the HighLevel token into the agent configuration—the server keeps it private.

For local use, copy `.env.example` to `.env`, insert the token there, and load it through your preferred environment manager before running:

```sh
npm ci
npm run build
npm start
```

Public tools are `search_users`, `list_calendars`, `get_calendar`, `update_calendar`, `ensure_user_on_matching_calendars`, and `change_calendar_slot_duration`. `change_calendar_slot_duration` accepts `calendarId`, expected and proposed durations (each with a `minutes` or `hours` unit), `dryRun`, and `changeReason`. It checks the current value before writing and verifies real updates with a second read. Use `dryRun: true` to preview normalized whole-minute values. The reason is returned for the invoking agent's audit trail; HighLevel does not persist it as calendar configuration.

The `update_calendar` input is deliberately narrow: `teamMembers` is the complete desired member array, so callers must GET and merge immediately before updating.

## Deploy and refresh

Build and restart the existing MCP backend with its normal process manager, preserving its secret-store environment. In ChatGPT developer mode, add or open **Torq CRM- Dr. Clean** using the deployed `/mcp` URL and its `MCP_SERVER_API_KEY`, choose **Refresh**, confirm all six tools (including `change_calendar_slot_duration`) are discovered, and start a new conversation. For a reviewed plugin, publish a new connector version before refreshing.

For local stdio protocol inspection after building, run `npx @modelcontextprotocol/inspector@latest node dist/src/stdio.js` with the same secret-store-backed environment. Never put a token in the command line or repository.
