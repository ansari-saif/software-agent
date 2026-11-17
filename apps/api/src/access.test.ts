import { AccessListResponseSchema, MeResponseSchema } from "@repo/contracts";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  ACCESS_NOT_GRANTED,
  createEmailCache,
  createMemoryAccessStore,
  lookupClerkPrimaryEmail,
  primaryEmailFromClerkUser,
  sortAccessRecords,
  SUPERADMIN_EMAIL,
  type AccessStore,
} from "./access";
import { createApp, type ApiDeps } from "./app";
import { createTestDeps, createTestKeys, TEST_AZP } from "./testUtils";

const keys = createTestKeys();

function bearer(sub: string, email?: string): string {
  return `Bearer ${keys.sign(sub, TEST_AZP, email)}`;
}

function build(partial: Partial<ApiDeps> = {}) {
  const access = partial.access ?? createMemoryAccessStore();
  const ensureUser = partial.ensureUser ?? vi.fn(async () => undefined);
  const lookupClerkEmail = partial.lookupClerkEmail ?? vi.fn(async () => null);
  const { deps } = createTestDeps(keys.publicKey, {
    ...partial,
    access,
    ensureUser,
    lookupClerkEmail,
  });
  return {
    app: createApp(deps),
    access: access as AccessStore,
    ensureUser: ensureUser as ReturnType<typeof vi.fn>,
    lookupClerkEmail: lookupClerkEmail as ReturnType<typeof vi.fn>,
  };
}

describe("portal access gate", () => {
  let access: AccessStore;
  let app: ReturnType<typeof createApp>;
  let ensureUser: ReturnType<typeof vi.fn>;
  let lookupClerkEmail: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    const built = build();
    access = built.access;
    app = built.app;
    ensureUser = built.ensureUser;
    lookupClerkEmail = built.lookupClerkEmail;
  });

  it("keeps the superadmin email fixed and case-insensitive", async () => {
    expect(SUPERADMIN_EMAIL).toBe("saifhussainansari6@gmail.com");
    const res = await request(app)
      .get("/v1/me")
      .set("Authorization", bearer("user_saif", "SaifHussainAnsari6@Gmail.com"));
    expect(res.status).toBe(200);
    expect(MeResponseSchema.parse(res.body)).toEqual({
      email: SUPERADMIN_EMAIL,
      role: "superadmin",
    });
    expect(lookupClerkEmail).not.toHaveBeenCalled();
    expect((await access.list()).requests).toEqual([]);
    expect((await access.list()).enabled).toEqual([]);
  });

  it("lets any verified user read /v1/me and request access without a user row", async () => {
    const me = await request(app).get("/v1/me").set("Authorization", bearer("user_new", "New@Example.com"));
    expect(me.status).toBe(200);
    expect(me.body).toEqual({ email: "new@example.com", role: "none" });
    expect(ensureUser).not.toHaveBeenCalled();

    const asked = await request(app)
      .post("/v1/access/request")
      .set("Authorization", bearer("user_new", "New@Example.com"));
    expect(asked.status).toBe(200);
    expect(asked.body).toEqual({ ok: true });
    expect(ensureUser).not.toHaveBeenCalled();

    const pending = await request(app).get("/v1/me").set("Authorization", bearer("user_new", "new@example.com"));
    expect(pending.body.role).toBe("pending");
    expect((await access.list()).requests.map((row) => row.email)).toEqual(["new@example.com"]);
  });

  it("does not downgrade an enabled person who requests again", async () => {
    await access.enable("kept@example.com");
    const res = await request(app)
      .post("/v1/access/request")
      .set("Authorization", bearer("user_kept", "kept@example.com"));
    expect(res.status).toBe(200);
    const me = await request(app).get("/v1/me").set("Authorization", bearer("user_kept", "kept@example.com"));
    expect(me.body.role).toBe("member");
    expect((await access.list()).enabled.map((row) => row.email)).toEqual(["kept@example.com"]);
    expect((await access.list()).requests).toEqual([]);
  });

  it("blocks pending and none from product routes and does not create a user", async () => {
    await access.request("pending@example.com");
    const pending = await request(app)
      .post("/v1/projects")
      .set("Authorization", bearer("user_pending", "pending@example.com"))
      .send({ prompt: "Build a notes app" });
    expect(pending.status).toBe(403);
    expect(pending.body.error).toMatchObject({ code: "FORBIDDEN", message: ACCESS_NOT_GRANTED });

    const none = await request(app)
      .get("/v1/projects")
      .set("Authorization", bearer("user_none", "none@example.com"));
    expect(none.status).toBe(403);
    expect(none.body.error.message).toBe(ACCESS_NOT_GRANTED);
    expect(ensureUser).not.toHaveBeenCalled();
  });

  it("allows members and the superadmin through product routes, and rechecks after removal", async () => {
    const seen = new Set<string>();
    const skipping = vi.fn(async (id: string) => {
      if (seen.has(id)) return;
      seen.add(id);
    });
    const built = build({ ensureUser: skipping });
    await built.access.enable("member@example.com");

    const open = await request(built.app)
      .get("/v1/openapi.json")
      .set("Authorization", bearer("user_member", "member@example.com"));
    expect(open.status).toBe(200);
    expect(skipping).toHaveBeenCalledWith("user_member", "member@example.com");

    const again = await request(built.app)
      .get("/v1/openapi.json")
      .set("Authorization", bearer("user_member", "member@example.com"));
    expect(again.status).toBe(200);

    const admin = await request(built.app)
      .delete("/v1/access")
      .set("Authorization", bearer("user_saif", SUPERADMIN_EMAIL))
      .send({ email: "member@example.com" });
    expect(admin.status).toBe(200);

    const blocked = await request(built.app)
      .get("/v1/openapi.json")
      .set("Authorization", bearer("user_member", "member@example.com"));
    expect(blocked.status).toBe(403);
    expect(blocked.body.error.message).toBe(ACCESS_NOT_GRANTED);
  });

  it("limits access administration to the superadmin", async () => {
    await access.request("wait@example.com");
    await access.enable("live@example.com");

    const member = await request(app)
      .get("/v1/access")
      .set("Authorization", bearer("user_member", "live@example.com"));
    expect(member.status).toBe(403);
    expect(member.body.error).toMatchObject({ code: "FORBIDDEN", message: "Forbidden" });

    const pending = await request(app)
      .post("/v1/access")
      .set("Authorization", bearer("user_wait", "wait@example.com"))
      .send({ email: "other@example.com" });
    expect(pending.status).toBe(403);
    expect(pending.body.error.message).toBe("Forbidden");

    const listed = await request(app).get("/v1/access").set("Authorization", bearer("user_saif", SUPERADMIN_EMAIL));
    expect(listed.status).toBe(200);
    expect(AccessListResponseSchema.parse(listed.body).requests.map((row) => row.email)).toEqual(["wait@example.com"]);
    expect(listed.body.enabled.map((row: { email: string }) => row.email)).toEqual(["live@example.com"]);

    const enabled = await request(app)
      .post("/v1/access")
      .set("Authorization", bearer("user_saif", SUPERADMIN_EMAIL))
      .send({ email: "  Direct@Example.com " });
    expect(enabled.status).toBe(200);
    expect((await access.list()).enabled.map((row) => row.email)).toContain("direct@example.com");

    const dismissed = await request(app)
      .delete("/v1/access/request")
      .set("Authorization", bearer("user_saif", SUPERADMIN_EMAIL))
      .send({ email: "wait@example.com" });
    expect(dismissed.body).toEqual({ ok: true });
    expect((await access.list()).requests).toEqual([]);

    const removed = await request(app)
      .delete("/v1/access")
      .set("Authorization", bearer("user_saif", SUPERADMIN_EMAIL))
      .send({ email: "live@example.com" });
    expect(removed.status).toBe(200);
    expect((await access.list()).enabled.map((row) => row.email)).not.toContain("live@example.com");
  });

  it("never stores the superadmin and does not let dismiss or remove cross statuses", async () => {
    const auth = { Authorization: bearer("user_saif", SUPERADMIN_EMAIL) };
    expect((await request(app).post("/v1/access/request").set(auth)).status).toBe(200);
    expect((await request(app).post("/v1/access").set(auth).send({ email: SUPERADMIN_EMAIL })).status).toBe(200);
    const removed = await request(app).delete("/v1/access").set(auth).send({ email: SUPERADMIN_EMAIL });
    expect(removed.status).toBe(400);
    expect(removed.body.error.message).toBe("cannot remove superadmin");
    expect(await access.getByEmail(SUPERADMIN_EMAIL)).toBeNull();

    await access.request("stay-pending@example.com");
    await access.enable("stay-enabled@example.com");
    await request(app).delete("/v1/access").set(auth).send({ email: "stay-pending@example.com" });
    await request(app).delete("/v1/access/request").set(auth).send({ email: "stay-enabled@example.com" });
    expect((await access.getByEmail("stay-pending@example.com"))?.status).toBe("PENDING");
    expect((await access.getByEmail("stay-enabled@example.com"))?.status).toBe("ENABLED");
  });

  it("returns 401 when the email cannot be resolved and does not call Clerk if the claim is present", async () => {
    const missing = await request(app).get("/v1/me").set("Authorization", bearer("user_no_email"));
    expect(missing.status).toBe(401);
    expect(missing.body.error.code).toBe("UNAUTHORIZED");
    expect(lookupClerkEmail).toHaveBeenCalledWith("user_no_email");

    lookupClerkEmail.mockClear();
    const claimed = await request(app)
      .get("/v1/me")
      .set("Authorization", bearer("user_claimed", "claimed@example.com"));
    expect(claimed.status).toBe(200);
    expect(lookupClerkEmail).not.toHaveBeenCalled();
  });

  it("uses the five-minute cache and then the Clerk lookup", async () => {
    const lookup = vi.fn(async (_userId: string): Promise<string | null> => "from-clerk@example.com");
    const built = build({ lookupClerkEmail: lookup });
    await request(built.app).get("/v1/me").set("Authorization", bearer("user_cache", "From-Claim@Example.com"));
    const cached = await request(built.app).get("/v1/me").set("Authorization", bearer("user_cache"));
    expect(cached.status).toBe(200);
    expect(cached.body.email).toBe("from-claim@example.com");
    expect(lookup).not.toHaveBeenCalled();

    const fetched = await request(built.app).get("/v1/me").set("Authorization", bearer("user_lookup"));
    expect(fetched.status).toBe(200);
    expect(fetched.body.email).toBe("from-clerk@example.com");
    expect(lookup).toHaveBeenCalledTimes(1);

    lookup.mockResolvedValueOnce(null);
    const failed = await request(built.app).get("/v1/me").set("Authorization", bearer("user_blank"));
    expect(failed.status).toBe(401);
    const recovered = await request(built.app).get("/v1/me").set("Authorization", bearer("user_blank"));
    expect(recovered.status).toBe(200);
    expect(recovered.body.email).toBe("from-clerk@example.com");
  });

  it("rejects an invalid enable body", async () => {
    const res = await request(app)
      .post("/v1/access")
      .set("Authorization", bearer("user_saif", SUPERADMIN_EMAIL))
      .send({ email: "not-an-email" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatchObject({ code: "VALIDATION_ERROR", message: "invalid email" });
  });
});

describe("access helpers", () => {
  it("sorts by created time then email", () => {
    const older = new Date("2026-11-01T00:00:00.000Z");
    const newer = new Date("2026-11-02T00:00:00.000Z");
    const sorted = sortAccessRecords([
      { email: "b@example.com", status: "PENDING", createdAt: older },
      { email: "a@example.com", status: "ENABLED", createdAt: newer },
      { email: "a@example.com", status: "PENDING", createdAt: older },
    ]);
    expect(sorted.map((row) => row.email)).toEqual(["a@example.com", "b@example.com", "a@example.com"]);
  });

  it("expires cached emails after five minutes", () => {
    let now = 1_000;
    const cache = createEmailCache(() => now);
    cache.set("user_1", "a@example.com");
    expect(cache.get("user_1")).toBe("a@example.com");
    now += 5 * 60 * 1000;
    expect(cache.get("user_1")).toBeUndefined();
  });

  it("reads the primary Clerk email and ignores failures without logging a body", async () => {
    expect(
      primaryEmailFromClerkUser({
        primary_email_address_id: "idn_2",
        email_addresses: [
          { id: "idn_1", email_address: "other@example.com" },
          { id: "idn_2", email_address: "Primary@Example.com" },
        ],
      })
    ).toBe("primary@example.com");
    expect(primaryEmailFromClerkUser({ email_addresses: [{ email_address: "fallback@example.com" }] })).toBe(
      "fallback@example.com"
    );
    expect(primaryEmailFromClerkUser({ email_addresses: [{ email_address: "bad" }] })).toBeNull();

    const fetchImpl = vi.fn(async () => new Response("nope", { status: 500 }));
    await expect(lookupClerkPrimaryEmail("user_1", "sk_test_unit_only", fetchImpl)).resolves.toBeNull();
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://api.clerk.com/v1/users/user_1",
      expect.objectContaining({
        headers: { Authorization: "Bearer sk_test_unit_only" },
        redirect: "error",
      })
    );

    const ok = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            primary_email_address_id: "idn_1",
            email_addresses: [{ id: "idn_1", email_address: "Ok@Example.com" }],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
    );
    await expect(lookupClerkPrimaryEmail("user_2", "sk_test_unit_only", ok)).resolves.toBe("ok@example.com");
  });
});
