import { describe, expect, it } from "vitest";
import {
  AccessEmailSchema,
  AccessListResponseSchema,
  CreateProjectRequestSchema,
  ImageBlockSchema,
  MAX_IMAGE_BASE64_LENGTH,
  MeResponseSchema,
  SendMessageRequestSchema,
  UpdateProjectRequestSchema,
  deriveProjectName,
} from "./index";

describe("@repo/contracts schemas", () => {
  it("validates CreateProjectRequest requiring prompt or image", () => {
    expect(CreateProjectRequestSchema.safeParse({ prompt: "   " }).success).toBe(
      false
    );
    const valid = CreateProjectRequestSchema.safeParse({
      prompt: "Build an interactive synthesizer with WebAudio",
    });
    expect(valid.success).toBe(true);
  });

  it("rejects disallowed image media types and oversized payloads", () => {
    expect(
      ImageBlockSchema.safeParse({
        type: "image",
        mediaType: "image/svg+xml",
        base64: "AAAA",
      }).success
    ).toBe(false);

    expect(
      ImageBlockSchema.safeParse({
        type: "image",
        mediaType: "image/png",
        base64: "A".repeat(MAX_IMAGE_BASE64_LENGTH + 10),
      }).success
    ).toBe(false);

    expect(
      ImageBlockSchema.safeParse({
        type: "image",
        mediaType: "image/png",
        base64: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
      }).success
    ).toBe(true);
  });

  it("validates UpdateProjectRequest and SendMessageRequest", () => {
    expect(UpdateProjectRequestSchema.safeParse({}).success).toBe(false);
    expect(
      UpdateProjectRequestSchema.safeParse({ name: "My App" }).success
    ).toBe(true);
    expect(
      SendMessageRequestSchema.safeParse({ prompt: "Add dark mode" }).success
    ).toBe(true);
  });

  it("normalizes portal access emails and roles", () => {
    expect(AccessEmailSchema.parse("  Ada@Example.com ")).toBe("ada@example.com");
    expect(AccessEmailSchema.safeParse("not-an-email").success).toBe(false);
    expect(MeResponseSchema.parse({ email: "A@B.co", role: "pending" })).toEqual({
      email: "a@b.co",
      role: "pending",
    });
    expect(
      AccessListResponseSchema.parse({
        requests: [{ email: "wait@example.com", createdAt: "2026-11-17T00:00:00.000Z" }],
        enabled: [],
      }).requests
    ).toHaveLength(1);
  });

  it("derives readable project names", () => {
    expect(
      deriveProjectName("Create a kanban board with drag and drop and columns")
    ).toBe("Create a kanban board with drag");
    expect(deriveProjectName("   ")).toBe("Untitled Project");
  });
});
