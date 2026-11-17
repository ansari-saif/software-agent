import crypto from "crypto";
import { prismaClient } from "db";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "./app";
import { createTestDeps, createTestKeys, TEST_AZP } from "./testUtils";

// Explicit opt-in: Prisma auto-loads .env files, so DATABASE_URL alone may point at a real database.
const runIntegration = process.env.RUN_DB_TESTS === "1";

describe.skipIf(!runIntegration)("API against Postgres", () => {
  const keys = createTestKeys();
  const suffix = crypto.randomUUID().slice(0, 8);
  const alice = `user_alice_${suffix}`;
  const mallory = `user_mallory_${suffix}`;
  const stranger = `user_stranger_${suffix}`;
  const aliceEmail = `alice.${suffix}@example.com`;
  const malloryEmail = `mallory.${suffix}@example.com`;
  const strangerEmail = `stranger.${suffix}@example.com`;
  const { deps, enqueued } = createTestDeps(keys.publicKey);
  const app = createApp(deps);
  const asAlice = `Bearer ${keys.sign(alice, TEST_AZP, aliceEmail)}`;
  const asMallory = `Bearer ${keys.sign(mallory, TEST_AZP, malloryEmail)}`;

  let projectId = "";
  let runId = "";

  beforeAll(async () => {
    await prismaClient.portalAccess.createMany({
      data: [
        { email: aliceEmail, status: "ENABLED" },
        { email: malloryEmail, status: "ENABLED" },
      ],
    });
    const res = await request(app)
      .post("/v1/projects")
      .set("Authorization", asAlice)
      .set("Idempotency-Key", `create-${suffix}`)
      .send({ prompt: "Build a pomodoro timer as a single HTML page" });
    expect(res.status).toBe(201);
    projectId = res.body.project.id;
    runId = res.body.run.id;
  });

  afterAll(async () => {
    await prismaClient.portalAccess.deleteMany({
      where: { email: { in: [aliceEmail, malloryEmail, strangerEmail] } },
    });
    await prismaClient.user.deleteMany({ where: { id: { in: [alice, mallory, stranger] } } });
    await prismaClient.$disconnect();
  });

  it("creates project, message, and queued run atomically and enqueues it", async () => {
    expect(enqueued).toContain(runId);
    const run = await prismaClient.run.findUniqueOrThrow({ where: { id: runId } });
    expect(run.status).toBe("QUEUED");
  });

  it("replays the same response for a repeated Idempotency-Key", async () => {
    const res = await request(app)
      .post("/v1/projects")
      .set("Authorization", asAlice)
      .set("Idempotency-Key", `create-${suffix}`)
      .send({ prompt: "Build a pomodoro timer as a single HTML page" });
    expect(res.status).toBe(200);
    expect(res.body.run.id).toBe(runId);
    expect(await prismaClient.project.count({ where: { userId: alice } })).toBe(1);
  });

  it("returns 409 when a run is already active for the project", async () => {
    const res = await request(app)
      .post(`/v1/projects/${projectId}/messages`)
      .set("Authorization", asAlice)
      .send({ prompt: "Add dark mode" });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("CONFLICT");
  });

  it.each([
    ["get", () => `/v1/projects/${projectId}`],
    ["patch", () => `/v1/projects/${projectId}`],
    ["delete", () => `/v1/projects/${projectId}`],
    ["get", () => `/v1/projects/${projectId}/messages`],
    ["post", () => `/v1/projects/${projectId}/messages`],
    ["post", () => `/v1/projects/${projectId}/sandbox`],
    ["delete", () => `/v1/projects/${projectId}/sandbox`],
    ["get", () => `/v1/projects/${projectId}/files`],
    ["get", () => `/v1/projects/${projectId}/export`],
    ["post", () => `/v1/runs/${runId}/cancel`],
    ["get", () => `/v1/runs/${runId}/events`],
  ] as const)("hides another user's resources: %s %s", async (method, path) => {
    const res = await request(app)[method](path()).set("Authorization", asMallory).send({ name: "pwned", prompt: "x" });
    expect(res.status).toBe(404);
  });

  it("refuses a stranger with a valid JWT and no access row", async () => {
    const res = await request(app)
      .post("/v1/projects")
      .set("Authorization", `Bearer ${keys.sign(stranger, TEST_AZP, strangerEmail)}`)
      .send({ prompt: "Build a secret app" });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("FORBIDDEN");
    expect(await prismaClient.project.count({ where: { userId: stranger } })).toBe(0);
    expect(await prismaClient.user.count({ where: { id: stranger } })).toBe(0);
  });

  it("does not list another user's projects", async () => {
    const res = await request(app).get("/v1/projects").set("Authorization", asMallory);
    expect(res.status).toBe(200);
    expect(res.body.items).toEqual([]);
  });

  it("streams persisted events with Last-Event-ID replay and closes on done", async () => {
    await prismaClient.runEvent.createMany({
      data: [
        { runId, seq: 0, type: "status", payload: { status: "RUNNING" } },
        { runId, seq: 1, type: "text_delta", payload: { text: "hi" } },
      ],
    });
    const cancel = await request(app).post(`/v1/runs/${runId}/cancel`).set("Authorization", asAlice);
    expect(cancel.status).toBe(200);
    expect(cancel.body.status).toBe("CANCELLED");

    const full = await request(app).get(
      `/v1/runs/${runId}/events?token=${keys.sign(alice, TEST_AZP, aliceEmail)}`
    );
    expect(full.status).toBe(200);
    expect(full.text).toContain("event: status");
    expect(full.text).toContain("event: done");

    const resumed = await request(app)
      .get(`/v1/runs/${runId}/events`)
      .set("Authorization", asAlice)
      .set("Last-Event-ID", "1");
    expect(resumed.text).not.toContain("event: status");
    expect(resumed.text).toContain("event: done");
  });

  it("allows a new message after the run finished and then deletes the project", async () => {
    const send = await request(app)
      .post(`/v1/projects/${projectId}/messages`)
      .set("Authorization", asAlice)
      .send({ prompt: "Add dark mode" });
    expect(send.status).toBe(201);

    const messages = await request(app).get(`/v1/projects/${projectId}/messages`).set("Authorization", asAlice);
    expect(messages.body.items).toHaveLength(2);
    expect(messages.body.activeRun?.id).toBe(send.body.run.id);

    const del = await request(app).delete(`/v1/projects/${projectId}`).set("Authorization", asAlice);
    expect(del.status).toBe(204);
    expect(await prismaClient.run.count({ where: { projectId } })).toBe(0);
  });
});
