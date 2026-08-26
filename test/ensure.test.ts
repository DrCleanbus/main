import assert from "node:assert/strict";
import test from "node:test";
import {
  HighLevelClient,
  HighLevelError,
  type HighLevelApi,
} from "../src/client.js";
import { ensureUserOnMatchingCalendars } from "../src/ensure.js";
import { changeCalendarSlotDuration } from "../src/slot-duration.js";
import type { Calendar, TeamMember, User } from "../src/types.js";

class FakeApi implements HighLevelApi {
  writes = 0;
  constructor(
    public users: User[],
    public calendars: Calendar[],
    public corrupt = false,
    public failId?: string,
  ) {}
  async searchUsers() {
    return { users: this.users, count: this.users.length };
  }
  async listCalendars() {
    return { calendars: this.calendars };
  }
  async getCalendar(id: string) {
    return {
      calendar: structuredClone(this.calendars.find((c) => c.id === id)!),
    };
  }
  async updateCalendar(id: string, members: TeamMember[]) {
    this.writes++;
    if (id === this.failId)
      throw new HighLevelError(
        "UPSTREAM_VALIDATION_FAILED",
        "bad calendar",
        422,
      );
    const calendar = this.calendars.find((c) => c.id === id)!;
    calendar.teamMembers = this.corrupt
      ? members.slice(1)
      : structuredClone(members);
    return { calendar };
  }
  async updateCalendarSlotDuration(id: string, slotDuration: number) {
    this.writes++;
    const calendar = this.calendars.find((c) => c.id === id)!;
    calendar.slotDuration = this.corrupt ? slotDuration + 5 : slotDuration;
    return { calendar };
  }
}
const dallen = {
  id: "d",
  name: "Dallen Test",
  email: "d@example.test",
  locationIds: ["loc"],
};
const member: TeamMember = {
  userId: "a",
  priority: 1,
  isPrimary: true,
  locationConfigurations: [{ kind: "custom", location: "Office" }],
};
const calendar = (
  id: string,
  name: string,
  type = "round_robin",
  members: TeamMember[] = [member],
): Calendar => ({
  id,
  name,
  calendarType: type,
  teamMembers: structuredClone(members),
});
const run = (api: FakeApi) =>
  ensureUserOnMatchingCalendars(api, {
    userQuery: "Dallen",
    calendarNameContains: "mobile",
    companyId: "co",
    locationId: "loc",
  });

test("updates case-insensitive matches, preserves metadata, verifies, and is idempotent", async () => {
  const api = new FakeApi(
    [dallen],
    [
      calendar("1", "Mobile One"),
      calendar("2", "MOBILE TWO"),
      calendar("3", "mobile three"),
    ],
  );
  const first = await run(api);
  assert.equal(first.updated.length, 3);
  assert.equal(first.verified, true);
  assert.deepEqual(api.calendars[0].teamMembers?.[0], member);
  assert.equal(
    api.calendars[0].teamMembers?.filter((m) => m.userId === "d").length,
    1,
  );
  const second = await run(api);
  assert.equal(second.alreadyPresent.length, 3);
  assert.equal(api.writes, 3);
});

test("ambiguous and missing users cause no writes", async () => {
  for (const users of [[], [dallen, { ...dallen, id: "d2" }]]) {
    const api = new FakeApi(users, [calendar("1", "Mobile")]);
    const result = await run(api);
    assert.ok(result.error);
    assert.equal(api.writes, 0);
  }
});

test("no matching calendars causes no writes", async () => {
  const api = new FakeApi([dallen], [calendar("1", "Shop")]);
  const result = await run(api);
  assert.equal(result.error?.code, "NO_MATCHING_CALENDARS");
  assert.equal(api.writes, 0);
});

test("personal and unknown types are skipped without replacement", async () => {
  const api = new FakeApi(
    [dallen],
    [
      calendar("1", "Mobile Personal", "personal"),
      calendar("2", "Mobile Odd", "mystery"),
    ],
  );
  const result = await run(api);
  assert.equal(result.skipped.length, 2);
  assert.equal(api.writes, 0);
});

test("one failure does not stop batch or claim success", async () => {
  const api = new FakeApi(
    [dallen],
    [calendar("bad", "Mobile Bad"), calendar("ok", "Mobile Good")],
    false,
    "bad",
  );
  const result = await run(api);
  assert.equal(result.failed.length, 1);
  assert.equal(result.updated.length, 1);
  assert.equal(result.verified, false);
});

test("read-after-write catches incomplete update", async () => {
  const api = new FakeApi([dallen], [calendar("1", "Mobile")], true);
  const result = await run(api);
  assert.equal(result.failed.length, 1);
  assert.match(result.failed[0].reason!, /VERIFICATION_FAILED/);
});

test("unsupported response member fields prevent unsafe writes", async () => {
  const unsafe = { ...member, meetingLocationType: "zoom" } as TeamMember;
  const api = new FakeApi(
    [dallen],
    [calendar("1", "Mobile", "collective", [unsafe])],
  );
  const result = await run(api);
  assert.equal(result.failed.length, 1);
  assert.equal(api.writes, 0);
});

test("maps documented upstream errors to structured codes without token disclosure", async () => {
  for (const [status, code] of [
    [400, "UPSTREAM_BAD_REQUEST"],
    [401, "UNAUTHORIZED_OR_MISSING_SCOPE"],
    [404, "NOT_FOUND"],
    [422, "UPSTREAM_VALIDATION_FAILED"],
    [429, "RATE_LIMITED"],
  ] as const) {
    const client = new HighLevelClient(
      "test-token-marker",
      "https://example.test",
      async () =>
        new Response(JSON.stringify({ message: "safe" }), {
          status,
          headers: { "content-type": "application/json" },
        }),
    );
    await assert.rejects(
      client.getCalendar("x"),
      (error: HighLevelError) =>
        error.code === code && !error.message.includes("test-token-marker"),
    );
  }
});

test("slot duration change converts units, checks expectation, and verifies", async () => {
  const target = { ...calendar("1", "Mobile"), slotDuration: 30 };
  const api = new FakeApi([dallen], [target]);
  const result = await changeCalendarSlotDuration(api, {
    calendarId: "1",
    expectedSlotDuration: 0.5,
    expectedSlotDurationUnit: "hours",
    proposedSlotDuration: 1,
    proposedSlotDurationUnit: "hours",
    dryRun: false,
    changeReason: "Allow longer appointments",
  });
  assert.equal(target.slotDuration, 60);
  assert.equal(result.changed, true);
  assert.equal(result.verified, true);
  assert.equal(result.changeReason, "Allow longer appointments");
});

test("slot duration dry run and stale expectation never write", async () => {
  const api = new FakeApi(
    [dallen],
    [{ ...calendar("1", "Mobile"), slotDuration: 30 }],
  );
  const base = {
    calendarId: "1",
    expectedSlotDuration: 30,
    expectedSlotDurationUnit: "minutes" as const,
    proposedSlotDuration: 45,
    proposedSlotDurationUnit: "minutes" as const,
    changeReason: "Scheduling policy",
  };
  const preview = await changeCalendarSlotDuration(api, {
    ...base,
    dryRun: true,
  });
  assert.equal(preview.changed, false);
  assert.equal(api.writes, 0);
  await assert.rejects(
    changeCalendarSlotDuration(api, {
      ...base,
      expectedSlotDuration: 25,
      dryRun: false,
    }),
    (error: HighLevelError) => error.code === "EXPECTED_SLOT_DURATION_MISMATCH",
  );
  assert.equal(api.writes, 0);
});

test("slot duration change detects failed read-after-write verification", async () => {
  const api = new FakeApi(
    [dallen],
    [{ ...calendar("1", "Mobile"), slotDuration: 30 }],
    true,
  );
  await assert.rejects(
    changeCalendarSlotDuration(api, {
      calendarId: "1",
      expectedSlotDuration: 30,
      expectedSlotDurationUnit: "minutes",
      proposedSlotDuration: 45,
      proposedSlotDurationUnit: "minutes",
      dryRun: false,
      changeReason: "Scheduling policy",
    }),
    (error: HighLevelError) => error.code === "VERIFICATION_FAILED",
  );
});
