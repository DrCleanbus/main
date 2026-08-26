export interface LocationConfiguration {
  kind: string;
  location: string;
}

export interface TeamMember {
  userId: string;
  priority?: 0 | 0.5 | 1;
  isPrimary?: boolean;
  locationConfigurations?: LocationConfiguration[];
}

export interface Calendar {
  id: string;
  name: string;
  calendarType: string;
  isActive?: boolean;
  groupId?: string;
  locationId?: string;
  teamMembers?: TeamMember[];
  slotDuration?: number;
  [key: string]: unknown;
}

export type DurationUnit = "minutes" | "hours";

export interface SlotDurationChangeResult {
  calendarId: string;
  changeReason: string;
  dryRun: boolean;
  changed: boolean;
  expectedSlotDurationMinutes: number;
  proposedSlotDurationMinutes: number;
  previousSlotDurationMinutes: number;
  verified: boolean;
}

export interface User {
  id: string;
  name?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  roles?: unknown;
  deleted?: boolean;
  locationIds?: string[];
  locations?: Array<string | { id?: string; locationId?: string }>;
}

export interface AuditItem {
  id: string;
  name: string;
  calendarType: string;
  status: "updated" | "already_present" | "skipped" | "failed";
  beforeMemberUserIds: string[];
  afterMemberUserIds: string[];
  reason?: string;
}

export interface EnsureResult {
  resolvedUser?: Pick<User, "id" | "name" | "email">;
  matchedCalendars: number;
  updated: AuditItem[];
  alreadyPresent: AuditItem[];
  skipped: AuditItem[];
  failed: AuditItem[];
  verified: boolean;
  error?: {
    code: string;
    message: string;
    candidates?: User[];
    observedCalendars?: string[];
  };
}
