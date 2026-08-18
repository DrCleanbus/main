# Torq CRM – Dr. Clean HighLevel MCP connector

```sh
npm ci
npm run build
npm start
```

Public tools are `search_users`, `list_calendars`, `get_calendar`, `update_calendar`, and `ensure_user_on_matching_calendars`. The `update_calendar` input is deliberately narrow: `teamMembers` is the complete desired member array, so callers must GET and merge immediately before updating.

## Deploy and refresh

Build and restart the existing MCP backend with its normal process manager, preserving its secret-store environment. In ChatGPT developer mode, open **Torq CRM- Dr. Clean**, choose **Refresh**, confirm all five tools are discovered, and start a new conversation. For a reviewed plugin, publish a new connector version before refreshing.

For local protocol inspection after building, run `npx @modelcontextprotocol/inspector@latest node dist/src/server.js` with the same secret-store-backed environment. Never put a token in the command line or repository.
