import { describe, expect, it } from "vitest";
import {
  CreateProjectRequestSchema,
  ImageBlockSchema,
  MAX_IMAGE_BASE64_LENGTH,
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

  it("derives readable project names", () => {
    expect(
      deriveProjectName("Create a kanban board with drag and drop and columns")
    ).toBe("Create a kanban board with drag");
    expect(deriveProjectName("   ")).toBe("Untitled Project");
  });
});
