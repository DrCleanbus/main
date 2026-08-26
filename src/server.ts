import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { HighLevelClient, HighLevelError } from "./client.js";
import { ensureUserOnMatchingCalendars } from "./ensure.js";
import { changeCalendarSlotDuration } from "./slot-duration.js";

export function createConnectorServer(options: {
  accessToken: string;
  companyId?: string;
  locationId?: string;
  baseUrl?: string;
}) {
  const api = new HighLevelClient(options.accessToken, options.baseUrl);
  const defaultCompanyId = options.companyId;
  const defaultLocationId = options.locationId;
  const server = new McpServer({
    name: "torq-crm-dr-clean-highlevel",
    version: "1.1.0",
  });
  const readAnnotations = {
    readOnlyHint: true,
    destructiveHint: false,
    openWorldHint: true,
  };
  const writeAnnotations = {
    readOnlyHint: false,
    destructiveHint: false,
    openWorldHint: true,
  };
  const memberSchema = z.object({
    userId: z.string().min(1),
    priority: z.union([z.literal(0), z.literal(0.5), z.literal(1)]).optional(),
    isPrimary: z.boolean().optional(),
    locationConfigurations: z
      .array(z.object({ kind: z.string(), location: z.string() }))
      .optional(),
  });

  function required(value: string | undefined, name: string): string {
    if (!value)
      throw new HighLevelError(
        "VALIDATION_ERROR",
        `${name} is required; configure a connection default or pass it explicitly.`,
      );
    return value;
  }

  function response(value: unknown) {
    return {
      content: [{ type: "text" as const, text: JSON.stringify(value) }],
      structuredContent: value as Record<string, unknown>,
    };
  }

  function failure(error: unknown) {
    const safe =
      error instanceof HighLevelError
        ? {
            code: error.code,
            message: error.message,
            status: error.status,
            retryAfter: error.retryAfter,
          }
        : { code: "CONNECTOR_ERROR", message: "Unexpected connector error" };
    return { isError: true, ...response({ error: safe }) };
  }

  server.registerTool(
    "search_users",
    {
      description: "Find existing HighLevel users in the authorized account.",
      inputSchema: {
        query: z.string().optional(),
        companyId: z.string().optional(),
        locationId: z.string().optional(),
        skip: z.number().int().nonnegative().default(0),
        limit: z.number().int().min(1).max(100).default(25),
      },
      annotations: readAnnotations,
    },
    async (args) => {
      try {
        return response(
          await api.searchUsers({
            ...args,
            companyId: required(
              args.companyId ?? defaultCompanyId,
              "companyId",
            ),
            locationId: required(
              args.locationId ?? defaultLocationId,
              "locationId",
            ),
          }),
        );
      } catch (error) {
        return failure(error);
      }
    },
  );

  server.registerTool(
    "list_calendars",
    {
      description:
        "List calendars and team members in the authorized location.",
      inputSchema: {
        locationId: z.string().optional(),
        groupId: z.string().optional(),
        showDrafted: z.boolean().default(true),
      },
      annotations: readAnnotations,
    },
    async (args) => {
      try {
        return response(
          await api.listCalendars({
            ...args,
            locationId: required(
              args.locationId ?? defaultLocationId,
              "locationId",
            ),
          }),
        );
      } catch (error) {
        return failure(error);
      }
    },
  );

  server.registerTool(
    "get_calendar",
    {
      description: "Get fresh settings and team members for one calendar.",
      inputSchema: { calendarId: z.string().min(1) },
      annotations: readAnnotations,
    },
    async ({ calendarId }) => {
      try {
        return response(await api.getCalendar(calendarId));
      } catch (error) {
        return failure(error);
      }
    },
  );

  server.registerTool(
    "update_calendar",
    {
      description:
        "Replace teamMembers with the complete desired array. Read and merge the latest calendar first; omitted members are removed.",
      inputSchema: {
        calendarId: z.string().min(1),
        teamMembers: z.array(memberSchema),
      },
      annotations: writeAnnotations,
    },
    async ({ calendarId, teamMembers }) => {
      try {
        return response(await api.updateCalendar(calendarId, teamMembers));
      } catch (error) {
        return failure(error);
      }
    },
  );

  server.registerTool(
    "ensure_user_on_matching_calendars",
    {
      description:
        "Safely ensure one unambiguous existing user belongs to every compatible calendar whose name contains exact text, preserving and verifying existing members.",
      inputSchema: {
        userQuery: z.string().default("Dallen"),
        calendarNameContains: z.string().default("mobile"),
        companyId: z.string().optional(),
        locationId: z.string().optional(),
        showDrafted: z.boolean().default(true),
        dryRun: z.boolean().default(false),
      },
      annotations: writeAnnotations,
    },
    async (args) => {
      try {
        return response(
          await ensureUserOnMatchingCalendars(api, {
            ...args,
            companyId: required(
              args.companyId ?? defaultCompanyId,
              "companyId",
            ),
            locationId: required(
              args.locationId ?? defaultLocationId,
              "locationId",
            ),
          }),
        );
      } catch (error) {
        return failure(error);
      }
    },
  );

  server.registerTool(
    "change_calendar_slot_duration",
    {
      description:
        "Safely preview or change one calendar's slot duration. The expected value provides optimistic concurrency protection; the reason is returned for the caller's audit trail.",
      inputSchema: {
        calendarId: z.string().min(1),
        expectedSlotDuration: z.number().positive(),
        expectedSlotDurationUnit: z.enum(["minutes", "hours"]),
        proposedSlotDuration: z.number().positive(),
        proposedSlotDurationUnit: z.enum(["minutes", "hours"]),
        dryRun: z.boolean(),
        changeReason: z.string().trim().min(1),
      },
      annotations: writeAnnotations,
    },
    async (args) => {
      try {
        return response(await changeCalendarSlotDuration(api, args));
      } catch (error) {
        return failure(error);
      }
    },
  );

  return server;
}
