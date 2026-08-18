import { HighLevelError, type HighLevelApi } from "./client.js";
import type {
  AuditItem,
  Calendar,
  EnsureResult,
  TeamMember,
  User,
} from "./types.js";

const COMPATIBLE_TYPES = new Set([
  "round_robin",
  "collective",
  "class_booking",
  "service_booking",
]);

function belongsToLocation(user: User, locationId: string): boolean {
  if (!user.locationIds && !user.locations) return true;
  return Boolean(
    user.locationIds?.includes(locationId) ||
    user.locations?.some((value) =>
      typeof value === "string"
        ? value === locationId
        : value.id === locationId || value.locationId === locationId,
    ),
  );
}

function writableMembers(calendar: Calendar): TeamMember[] {
  return (calendar.teamMembers ?? []).map((member) => {
    const allowed = new Set([
      "userId",
      "priority",
      "isPrimary",
      "locationConfigurations",
    ]);
    const unknown = Object.keys(member).filter((key) => !allowed.has(key));
    if (unknown.length)
      throw new HighLevelError(
        "UNSAFE_MEMBER_CONFIGURATION",
        `Member ${member.userId} has unsupported fields: ${unknown.join(", ")}`,
      );
    return structuredClone(member);
  });
}

function metadataEqual(before: TeamMember, after: TeamMember): boolean {
  return JSON.stringify(before) === JSON.stringify(after);
}

function item(
  calendar: Calendar,
  status: AuditItem["status"],
  before: string[],
  after = before,
  reason?: string,
): AuditItem {
  return {
    id: calendar.id,
    name: calendar.name,
    calendarType: calendar.calendarType,
    status,
    beforeMemberUserIds: before,
    afterMemberUserIds: after,
    ...(reason ? { reason } : {}),
  };
}

export async function ensureUserOnMatchingCalendars(
  api: HighLevelApi,
  input: {
    userQuery: string;
    calendarNameContains: string;
    companyId: string;
    locationId: string;
    showDrafted?: boolean;
    dryRun?: boolean;
  },
): Promise<EnsureResult> {
  const result: EnsureResult = {
    matchedCalendars: 0,
    updated: [],
    alreadyPresent: [],
    skipped: [],
    failed: [],
    verified: false,
  };
  const found = await api.searchUsers({
    companyId: input.companyId,
    locationId: input.locationId,
    query: input.userQuery,
    limit: 25,
  });
  const candidates = found.users.filter(
    (user) => !user.deleted && belongsToLocation(user, input.locationId),
  );
  if (candidates.length !== 1) {
    result.error =
      candidates.length === 0
        ? {
            code: "USER_NOT_FOUND",
            message: "No active user matched the query.",
          }
        : {
            code: "AMBIGUOUS_USER",
            message:
              "Multiple active users matched; no calendars were changed.",
            candidates,
          };
    return result;
  }
  const user = candidates[0];
  result.resolvedUser = { id: user.id, name: user.name, email: user.email };
  const listed = await api.listCalendars({
    locationId: input.locationId,
    showDrafted: input.showDrafted ?? true,
  });
  const needle = input.calendarNameContains.toLocaleLowerCase();
  const targets = listed.calendars.filter((calendar) =>
    calendar.name.toLocaleLowerCase().includes(needle),
  );
  result.matchedCalendars = targets.length;
  if (!targets.length) {
    result.error = {
      code: "NO_MATCHING_CALENDARS",
      message: "No calendar name contained the requested text.",
      observedCalendars: listed.calendars.map((calendar) => calendar.name),
    };
    return result;
  }

  for (const listedCalendar of targets) {
    let current: Calendar = listedCalendar;
    try {
      current = (await api.getCalendar(listedCalendar.id)).calendar;
      const beforeMembers = writableMembers(current);
      const beforeIds = beforeMembers.map((member) => member.userId);
      if (!COMPATIBLE_TYPES.has(current.calendarType)) {
        result.skipped.push(
          item(
            current,
            "skipped",
            beforeIds,
            beforeIds,
            `Calendar type ${current.calendarType} does not support safe team-member additions.`,
          ),
        );
        continue;
      }
      if (beforeIds.includes(user.id)) {
        result.alreadyPresent.push(item(current, "already_present", beforeIds));
        continue;
      }
      const desired = [
        ...beforeMembers,
        { userId: user.id, priority: 0.5 as const, isPrimary: false },
      ];
      if (input.dryRun) {
        result.skipped.push(
          item(
            current,
            "skipped",
            beforeIds,
            desired.map((member) => member.userId),
            "dry_run",
          ),
        );
        continue;
      }
      await api.updateCalendar(current.id, desired);
      const verified = (await api.getCalendar(current.id)).calendar;
      const afterMembers = writableMembers(verified);
      const afterIds = afterMembers.map((member) => member.userId);
      const preserved = beforeMembers.every(
        (member, index) =>
          afterMembers[index]?.userId === member.userId &&
          metadataEqual(member, afterMembers[index]),
      );
      if (afterIds.filter((id) => id === user.id).length !== 1 || !preserved)
        throw new HighLevelError(
          "VERIFICATION_FAILED",
          "Read-after-write did not preserve all prior members or add the requested user exactly once.",
        );
      result.updated.push(item(current, "updated", beforeIds, afterIds));
    } catch (error) {
      const before = (current.teamMembers ?? []).map((member) => member.userId);
      result.failed.push(
        item(
          current,
          "failed",
          before,
          before,
          error instanceof HighLevelError
            ? `${error.code}: ${error.message}`
            : "Unexpected connector error",
        ),
      );
    }
  }
  result.verified = result.failed.length === 0 && !input.dryRun;
  return result;
}
