import type { Calendar, TeamMember, User } from "./types.js";

export class HighLevelError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status?: number,
    public readonly retryAfter?: string,
  ) {
    super(message);
  }
}

export interface HighLevelApi {
  searchUsers(input: {
    companyId: string;
    locationId: string;
    query?: string;
    skip?: number;
    limit?: number;
  }): Promise<{ users: User[]; count: number }>;
  listCalendars(input: {
    locationId: string;
    groupId?: string;
    showDrafted?: boolean;
  }): Promise<{ calendars: Calendar[] }>;
  getCalendar(calendarId: string): Promise<{ calendar: Calendar }>;
  updateCalendar(
    calendarId: string,
    teamMembers: TeamMember[],
  ): Promise<{ calendar: Calendar }>;
}

export class HighLevelClient implements HighLevelApi {
  constructor(
    private readonly accessToken: string,
    private readonly baseUrl = "https://services.leadconnectorhq.com",
    private readonly fetcher: typeof fetch = fetch,
  ) {}

  private async request(
    path: string,
    version: string,
    init: RequestInit = {},
  ): Promise<any> {
    const response = await this.fetcher(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        Accept: "application/json",
        Version: version,
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...init.headers,
      },
    });
    if (!response.ok) {
      const codeByStatus: Record<number, string> = {
        400: "UPSTREAM_BAD_REQUEST",
        401: "UNAUTHORIZED_OR_MISSING_SCOPE",
        404: "NOT_FOUND",
        422: "UPSTREAM_VALIDATION_FAILED",
        429: "RATE_LIMITED",
      };
      let detail = response.statusText;
      try {
        const body = (await response.json()) as {
          message?: string;
          error?: string;
        };
        detail = body.message ?? body.error ?? detail;
      } catch {
        /* deliberately omit non-JSON upstream bodies */
      }
      throw new HighLevelError(
        codeByStatus[response.status] ?? "UPSTREAM_ERROR",
        `HighLevel request failed (${response.status}): ${detail}`,
        response.status,
        response.headers.get("retry-after") ?? undefined,
      );
    }
    return response.json();
  }

  async searchUsers(input: {
    companyId: string;
    locationId: string;
    query?: string;
    skip?: number;
    limit?: number;
  }) {
    const query = new URLSearchParams({
      companyId: input.companyId,
      locationId: input.locationId,
      skip: String(input.skip ?? 0),
      limit: String(input.limit ?? 25),
    });
    if (input.query) query.set("query", input.query);
    const result = await this.request(`/users/search?${query}`, "2021-07-28");
    const users = (result.users ?? []).map(sanitizeUser);
    return { users, count: result.count ?? result.total ?? users.length };
  }

  async listCalendars(input: {
    locationId: string;
    groupId?: string;
    showDrafted?: boolean;
  }) {
    const query = new URLSearchParams({
      locationId: input.locationId,
      showDrafted: String(input.showDrafted ?? true),
    });
    if (input.groupId) query.set("groupId", input.groupId);
    const result = await this.request(`/calendars/?${query}`, "2021-04-15");
    return { calendars: result.calendars ?? [] };
  }

  async getCalendar(calendarId: string) {
    if (!calendarId)
      throw new HighLevelError("VALIDATION_ERROR", "calendarId is required");
    const result = await this.request(
      `/calendars/${encodeURIComponent(calendarId)}`,
      "2021-04-15",
    );
    return { calendar: result.calendar ?? result };
  }

  async updateCalendar(calendarId: string, teamMembers: TeamMember[]) {
    if (!calendarId || !Array.isArray(teamMembers))
      throw new HighLevelError(
        "VALIDATION_ERROR",
        "calendarId and the complete teamMembers array are required",
      );
    const result = await this.request(
      `/calendars/${encodeURIComponent(calendarId)}`,
      "2021-04-15",
      { method: "PUT", body: JSON.stringify({ teamMembers }) },
    );
    return { calendar: result.calendar ?? result };
  }
}

function sanitizeUser(user: User): User {
  const {
    id,
    name,
    firstName,
    lastName,
    email,
    roles,
    deleted,
    locationIds,
    locations,
  } = user;
  return {
    id,
    name,
    firstName,
    lastName,
    email,
    roles,
    deleted,
    locationIds,
    locations,
  };
}
