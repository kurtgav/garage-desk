import { beforeEach, describe, expect, it, vi } from "vitest";

// Phase 5 /profile actions: boundary validation and call order. RLS/grants/storage policies are in integration.
const ME = { id: "11111111-1111-4111-8111-111111111111", fullName: "Ivan Dimitrov", email: "jun@garagedesk.test", role: "mechanic" };

const mocks = vi.hoisted(() => {
  const state = {
    updateResult: { data: [{ id: "x" }], error: null } as { data: unknown[] | null; error: unknown },
    avatarPath: null as string | null,
    uploadError: null as unknown,
    updateUserError: null as unknown,
    verify: { data: { user: { id: "" } }, error: null } as { data: { user: { id: string } | null }; error: unknown },
    signOutError: null as unknown,
  };
  return {
    state,
    requireStaff: vi.fn(),
    isRateLimited: vi.fn(async (): Promise<false | "limited" | "unavailable"> => false),
    update: vi.fn(),
    upload: vi.fn(),
    remove: vi.fn(),
    updateUser: vi.fn(),
    signIn: vi.fn(),
    verifierSignOut: vi.fn(),
    signOut: vi.fn(),
  };
});

vi.mock("@/lib/auth", () => ({ requireStaff: mocks.requireStaff }));
vi.mock("@/lib/rate-limit", () => ({ isRateLimited: mocks.isRateLimited }));
vi.mock("@/lib/data/profile", () => ({ AVATAR_BUCKET: "avatars" }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT;${url}`);
  },
}));
vi.mock("@/lib/supabase/server", () => ({
  createStatelessClient: () => ({
    auth: {
      signInWithPassword: async (creds: unknown) => (mocks.signIn(creds), mocks.state.verify),
      signOut: mocks.verifierSignOut,
    },
  }),
  createClient: async () => ({
    from: () => ({
      update: (patch: unknown) => {
        mocks.update(patch);
        const chain = { eq: () => chain, select: async () => mocks.state.updateResult };
        return chain;
      },
      select: () => {
        const chain = { eq: () => chain, single: async () => ({ data: { avatar_path: mocks.state.avatarPath }, error: null }) };
        return chain;
      },
    }),
    storage: {
      from: () => ({
        upload: async (...args: unknown[]) => (mocks.upload(...args), { error: mocks.state.uploadError }),
        remove: async (paths: string[]) => (mocks.remove(paths), { data: [], error: null }),
      }),
    },
    auth: {
      updateUser: async (attrs: unknown) => (mocks.updateUser(attrs), { error: mocks.state.updateUserError }),
      signOut: async (opts: unknown) => (mocks.signOut(opts), { error: mocks.state.signOutError }),
    },
  }),
}));

const { updateProfile, uploadAvatar, removeAvatar, changePassword, signOutEverywhere } = await import("@/app/(staff)/profile/actions");

function form(fields: Record<string, string | File>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
}

const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13];
const JPEG = [0xff, 0xd8, 0xff, 0xe0, 0, 16];
const WEBP = [0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50];
const photo = (bytes: number[], type: string, size = bytes.length) => {
  const body = new Uint8Array(size);
  body.set(bytes);
  return new File([body], "me.img", { type });
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireStaff.mockResolvedValue(ME);
  Object.assign(mocks.state, {
    updateResult: { data: [{ id: ME.id }], error: null },
    avatarPath: null,
    uploadError: null,
    updateUserError: null,
    verify: { data: { user: { id: ME.id } }, error: null },
    signOutError: null,
  });
});

describe("updateProfile", () => {
  it("saves trimmed name; empty phone/about become null", async () => {
    expect(await updateProfile(null, form({ full_name: "  Ivan  ", phone: " ", about: "" }))).toEqual({ ok: true });
    expect(mocks.update).toHaveBeenCalledWith({ full_name: "Ivan", phone: null, about: null });
  });

  it.each([
    [{ full_name: "   " }, /Enter your name/],
    [{ full_name: "x".repeat(101) }, /100 characters/],
    [{ full_name: "Ivan", phone: "1".repeat(31) }, /30 characters/],
    [{ full_name: "Ivan", about: "x".repeat(501) }, /500 characters/],
  ])("%j is refused before any write", async (fields, message) => {
    const res = await updateProfile(null, form(fields));
    expect(res.ok).toBe(false);
    expect(!res.ok && res.error).toMatch(message);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("no row updated (RLS) or a privilege error → permission message, not raw DB text", async () => {
    mocks.state.updateResult = { data: null, error: { code: "42501", message: "permission denied for table profiles" } };
    expect(await updateProfile(null, form({ full_name: "Ivan" }))).toEqual({ ok: false, error: "You don't have permission to do that." });
  });

  it("a name another staff member already uses (unique index) → NAME_TAKEN (D-091)", async () => {
    mocks.state.updateResult = { data: null, error: { code: "23505", message: "duplicate key value violates unique constraint" } };
    expect(await updateProfile(null, form({ full_name: "georgi petrov" }))).toEqual({
      ok: false,
      error: "Another staff member already uses that name.",
    });
  });

  it("a reserved name (check constraint) → NAME_RESERVED, not raw DB text (D-111)", async () => {
    mocks.state.updateResult = {
      data: null,
      error: { code: "23514", message: 'new row for relation "profiles" violates check constraint "profiles_full_name_reserved"' },
    };
    expect(await updateProfile(null, form({ full_name: "Customer" }))).toEqual({
      ok: false,
      error: "That name is reserved. Use your own name.",
    });
  });
});

describe("uploadAvatar", () => {
  it.each([
    [PNG, "image/png", "png"],
    [JPEG, "image/jpeg", "jpg"],
    [WEBP, "image/webp", "webp"],
  ])("accepts a real %s into the own folder under a random name, then drops the old file", async (bytes, type, ext) => {
    mocks.state.avatarPath = `${ME.id}/old-photo.png`;
    expect(await uploadAvatar(null, form({ avatar: photo(bytes, type) }))).toEqual({ ok: true });
    const [path, , opts] = mocks.upload.mock.calls[0];
    expect(path).toMatch(new RegExp(`^${ME.id}/[0-9a-f-]{36}\\.${ext}$`));
    expect(opts).toEqual({ contentType: type, upsert: false });
    expect(mocks.update).toHaveBeenCalledWith({ avatar_path: path });
    expect(mocks.remove).toHaveBeenCalledWith([`${ME.id}/old-photo.png`]);
  });

  it.each([
    ["no file", form({}), /Choose a photo/],
    ["empty file", form({ avatar: new File([], "x.png", { type: "image/png" }) }), /Choose a photo/],
    ["over 2 MB", form({ avatar: photo(PNG, "image/png", 2 * 1024 * 1024 + 1) }), /2 MB/],
    ["SVG", form({ avatar: new File(["<svg xmlns='http://www.w3.org/2000/svg'/>"], "x.svg", { type: "image/svg+xml" }) }), /PNG, JPEG or WebP/],
    ["SVG renamed to .png", form({ avatar: new File(["<svg xmlns='http://www.w3.org/2000/svg'/>"], "x.png", { type: "image/png" }) }), /PNG, JPEG or WebP/],
    ["GIF", form({ avatar: photo([0x47, 0x49, 0x46, 0x38], "image/gif") }), /PNG, JPEG or WebP/],
  ])("%s is refused before any upload", async (_name, fd, message) => {
    const res = await uploadAvatar(null, fd);
    expect(!res.ok && res.error).toMatch(message);
    expect(mocks.upload).not.toHaveBeenCalled();
  });

  it("profile update fails → the new file is removed again", async () => {
    mocks.state.updateResult = { data: [], error: null };
    const res = await uploadAvatar(null, form({ avatar: photo(PNG, "image/png") }));
    expect(res.ok).toBe(false);
    expect(mocks.remove).toHaveBeenCalledWith([mocks.upload.mock.calls[0][0]]);
  });
});

describe("removeAvatar", () => {
  it("clears the path, then deletes the file", async () => {
    mocks.state.avatarPath = `${ME.id}/a1b2c3d4.png`;
    expect(await removeAvatar()).toEqual({ ok: true });
    expect(mocks.update).toHaveBeenCalledWith({ avatar_path: null });
    expect(mocks.remove).toHaveBeenCalledWith([`${ME.id}/a1b2c3d4.png`]);
  });

  it("no photo → ok without writes", async () => {
    expect(await removeAvatar()).toEqual({ ok: true });
    expect(mocks.update).not.toHaveBeenCalled();
  });
});

describe("changePassword", () => {
  const VALID = { current_password: "Old-password-1", new_password: "New-password-22", confirm_password: "New-password-22" };

  it("checks the current password on a throwaway client, then updates the caller's own session", async () => {
    expect(await changePassword(null, form(VALID))).toEqual({ ok: true });
    expect(mocks.signIn).toHaveBeenCalledWith({ email: ME.email, password: VALID.current_password });
    expect(mocks.verifierSignOut).toHaveBeenCalledWith({ scope: "local" });
    expect(mocks.updateUser).toHaveBeenCalledWith({ password: VALID.new_password });
  });

  it("wrong current password → refused, nothing changed", async () => {
    mocks.state.verify = { data: { user: null }, error: { code: "invalid_credentials" } };
    expect(await changePassword(null, form(VALID))).toEqual({ ok: false, error: "Your current password is incorrect." });
    expect(mocks.updateUser).not.toHaveBeenCalled();
  });

  it.each([
    [{ new_password: "short1A", confirm_password: "short1A" }, /12 characters/],
    [{ new_password: "nouppercase123", confirm_password: "nouppercase123" }, /uppercase/],
    [{ confirm_password: "Something-else-1" }, /don't match/],
    [{ current_password: "" }, /current password/],
  ])("%j is refused before any Auth call", async (patch, message) => {
    const res = await changePassword(null, form({ ...VALID, ...patch }));
    expect(!res.ok && res.error).toMatch(message);
    expect(mocks.signIn).not.toHaveBeenCalled();
    expect(mocks.updateUser).not.toHaveBeenCalled();
  });

  it("an old session (Auth asks for reauthentication) → sign in again", async () => {
    mocks.state.updateUserError = { code: "reauthentication_needed", message: "Password update requires reauthentication" };
    expect(await changePassword(null, form(VALID))).toEqual({ ok: false, error: "Please sign in again to change your password." });
  });

  it.each([
    ["limited", "Too many attempts. Please wait a minute and try again."],
    // The limiter's DB call failed (fails closed, D-100): blocked, but not blamed on the user.
    ["unavailable", "Something went wrong. Please try again."],
  ] as const)("rate limiter says %s → refused before the password check", async (blocked, error) => {
    mocks.isRateLimited.mockResolvedValueOnce(blocked);
    expect(await changePassword(null, form(VALID))).toEqual({ ok: false, error });
    expect(mocks.isRateLimited).toHaveBeenCalledWith("passwordChange");
    expect(mocks.signIn).not.toHaveBeenCalled();
    expect(mocks.updateUser).not.toHaveBeenCalled();
  });
});

describe("signOutEverywhere", () => {
  it("ends every session (global scope), then goes to /login with the notice (D-107)", async () => {
    await expect(signOutEverywhere()).rejects.toThrow("NEXT_REDIRECT;/login?signed_out=everywhere");
    expect(mocks.requireStaff).toHaveBeenCalled();
    expect(mocks.signOut).toHaveBeenCalledWith({ scope: "global" });
  });

  it("Auth refuses → error shown, no redirect (this device stays signed in)", async () => {
    mocks.state.signOutError = { status: 500, message: "boom" };
    expect(await signOutEverywhere()).toEqual({ ok: false, error: "Something went wrong. Please try again." });
  });

  it("signed out (requireStaff redirects) → Auth is never called", async () => {
    mocks.requireStaff.mockRejectedValueOnce(new Error("NEXT_REDIRECT;/login"));
    await expect(signOutEverywhere()).rejects.toThrow("NEXT_REDIRECT;/login");
    expect(mocks.signOut).not.toHaveBeenCalled();
  });
});
