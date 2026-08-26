import { HighLevelError, type HighLevelApi } from "./client.js";
import type { DurationUnit, SlotDurationChangeResult } from "./types.js";

function minutes(value: number, unit: DurationUnit, field: string): number {
  const converted = unit === "hours" ? value * 60 : value;
  if (!Number.isInteger(converted) || converted <= 0)
    throw new HighLevelError(
      "VALIDATION_ERROR",
      `${field} must resolve to a positive whole number of minutes.`,
    );
  return converted;
}

export async function changeCalendarSlotDuration(
  api: HighLevelApi,
  input: {
    calendarId: string;
    expectedSlotDuration: number;
    expectedSlotDurationUnit: DurationUnit;
    proposedSlotDuration: number;
    proposedSlotDurationUnit: DurationUnit;
    dryRun: boolean;
    changeReason: string;
  },
): Promise<SlotDurationChangeResult> {
  const expected = minutes(
    input.expectedSlotDuration,
    input.expectedSlotDurationUnit,
    "expectedSlotDuration",
  );
  const proposed = minutes(
    input.proposedSlotDuration,
    input.proposedSlotDurationUnit,
    "proposedSlotDuration",
  );
  const reason = input.changeReason.trim();
  if (!reason)
    throw new HighLevelError(
      "VALIDATION_ERROR",
      "changeReason must not be blank.",
    );

  const current = (await api.getCalendar(input.calendarId)).calendar;
  if (!Number.isInteger(current.slotDuration) || current.slotDuration! <= 0)
    throw new HighLevelError(
      "UNSUPPORTED_CALENDAR_CONFIGURATION",
      "The calendar did not return a positive whole-minute slotDuration.",
    );
  if (current.slotDuration !== expected)
    throw new HighLevelError(
      "EXPECTED_SLOT_DURATION_MISMATCH",
      `Calendar slot duration is ${current.slotDuration} minutes, not the expected ${expected} minutes; no change was made.`,
    );

  const result: SlotDurationChangeResult = {
    calendarId: input.calendarId,
    changeReason: reason,
    dryRun: input.dryRun,
    changed: false,
    expectedSlotDurationMinutes: expected,
    proposedSlotDurationMinutes: proposed,
    previousSlotDurationMinutes: current.slotDuration,
    verified: false,
  };
  if (input.dryRun || proposed === expected) return result;

  await api.updateCalendarSlotDuration(input.calendarId, proposed);
  const verified = (await api.getCalendar(input.calendarId)).calendar;
  if (verified.slotDuration !== proposed)
    throw new HighLevelError(
      "VERIFICATION_FAILED",
      `Read-after-write returned ${String(verified.slotDuration)} minutes instead of ${proposed} minutes.`,
    );
  return { ...result, changed: true, verified: true };
}
