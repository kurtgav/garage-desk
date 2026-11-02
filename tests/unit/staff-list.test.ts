import { beforeEach, describe, expect, it, vi } from "vitest";

// NEXT-STEPS #20: /staff reads sign-in emails from every page of Auth users, not just the first 1000.
type AuthUser = { id: string; email?: string };
const mocks = vi.hoisted(() => ({
  pages: [] as { users: AuthUser[] }[],
  listUsersError: null as unknown,
  listUsers: vi.fn(),
  profiles: [] as { id: string; full_name: string; role: string; active: boolean; avatar_path: string | null }[],
}));

vi.mock("@/lib/auth", () => ({ requireOwner: vi.fn(async () => ({ id: "owner" })) }));
vi.mock("@/lib/data/profile", () => ({ signAvatarUrls: async () => new Map() }));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    auth: {
      admin: {
        listUsers: async (params: { page: number; perPage: number }) => {
          mocks.listUsers(params);
          return { data: mocks.pages[params.page - 1] ?? { users: [] }, error: mocks.listUsersError };
        },
      },
    },
  }),
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    from: (table: string) => ({
      select: () => ({
        order: async () => ({ data: table === "profiles" ? mocks.profiles : [], error: null }),
        in: async () => ({ data: [], error: null }),
      }),
    }),
  }),
}));

const { listStaff } = await import("@/lib/data/staff");

const users = (n: number, prefix: string): AuthUser[] =>
  Array.from({ length: n }, (_, i) => ({ id: `${prefix}${i}`, email: `${prefix}${i}@example.test` }));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.listUsersError = null;
  mocks.profiles = [{ id: "late", full_name: "Late Joiner", role: "mechanic", active: true, avatar_path: null }];
});

describe("listStaff: Auth users past the first page", () => {
  it("finds an email on page 2 and stops at the first short page", async () => {
    mocks.pages = [{ users: users(1000, "u") }, { users: [{ id: "late", email: "late@garagedesk.test" }] }];
    expect((await listStaff())[0]).toMatchObject({ id: "late", email: "late@garagedesk.test" });
    expect(mocks.listUsers.mock.calls.map(([p]) => p)).toEqual([
      { page: 1, perPage: 1000 },
      { page: 2, perPage: 1000 },
    ]);
  });

  it("exactly 1000 users → one more (empty) page, then done", async () => {
    mocks.pages = [{ users: [...users(999, "u"), { id: "late", email: "late@garagedesk.test" }] }];
    expect((await listStaff())[0].email).toBe("late@garagedesk.test");
    expect(mocks.listUsers).toHaveBeenCalledTimes(2);
  });

  it("an Auth error → throws (the page shows its error state), no partial list", async () => {
    mocks.pages = [{ users: [] }];
    mocks.listUsersError = { message: "boom" };
    await expect(listStaff()).rejects.toThrow("Could not load staff emails");
  });
});
