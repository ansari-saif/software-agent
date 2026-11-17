import { z } from "zod";

export const MAX_IMAGE_BYTES = 4 * 1024 * 1024; // 4 MB raw image limit
export const MAX_IMAGE_BASE64_LENGTH = Math.ceil((MAX_IMAGE_BYTES * 4) / 3);

export const AllowedImageMediaTypeSchema = z.enum([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
]);
export type AllowedImageMediaType = z.infer<typeof AllowedImageMediaTypeSchema>;

export const TextBlockSchema = z.object({
  type: z.literal("text"),
  text: z.string().min(1).max(200_000),
});
export type TextBlock = z.infer<typeof TextBlockSchema>;

export const ImageBlockSchema = z.object({
  type: z.literal("image"),
  mediaType: AllowedImageMediaTypeSchema,
  base64: z
    .string()
    .min(1)
    .max(MAX_IMAGE_BASE64_LENGTH, "Image exceeds 4 MB limit")
    .regex(/^[A-Za-z0-9+/=]+$/, "Invalid base64 image payload"),
});
export type ImageBlock = z.infer<typeof ImageBlockSchema>;

export const ToolUseBlockSchema = z.object({
  type: z.literal("tool_use"),
  id: z.string().min(1),
  name: z.string().min(1),
  input: z.record(z.unknown()),
});
export type ToolUseBlock = z.infer<typeof ToolUseBlockSchema>;

export const ToolResultBlockSchema = z.object({
  type: z.literal("tool_result"),
  toolUseId: z.string().min(1),
  name: z.string().min(1),
  content: z.string(),
  isError: z.boolean().optional(),
});
export type ToolResultBlock = z.infer<typeof ToolResultBlockSchema>;

export const ContentBlockSchema = z.discriminatedUnion("type", [
  TextBlockSchema,
  ImageBlockSchema,
  ToolUseBlockSchema,
  ToolResultBlockSchema,
]);
export type ContentBlock = z.infer<typeof ContentBlockSchema>;

export const RoleSchema = z.enum(["USER", "ASSISTANT"]);
export type Role = z.infer<typeof RoleSchema>;

export const RunStatusSchema = z.enum([
  "QUEUED",
  "RUNNING",
  "SUCCEEDED",
  "FAILED",
  "CANCELLED",
]);
export type RunStatus = z.infer<typeof RunStatusSchema>;

export const SandboxStatusSchema = z.enum([
  "STARTING",
  "RUNNING",
  "STOPPED",
  "ERROR",
]);
export type SandboxStatus = z.infer<typeof SandboxStatusSchema>;

export const ApiErrorCodeSchema = z.enum([
  "UNAUTHORIZED",
  "FORBIDDEN",
  "NOT_FOUND",
  "VALIDATION_ERROR",
  "CONFLICT",
  "RATE_LIMITED",
  "QUOTA_EXCEEDED",
  "SANDBOX_CAPACITY",
  "INTERNAL_ERROR",
]);
export type ApiErrorCode = z.infer<typeof ApiErrorCodeSchema>;

export const ApiErrorEnvelopeSchema = z.object({
  error: z.object({
    code: ApiErrorCodeSchema,
    message: z.string(),
    details: z.unknown().optional(),
    resetAt: z.string().optional(),
  }),
});
export type ApiErrorEnvelope = z.infer<typeof ApiErrorEnvelopeSchema>;

export const PortalRoleSchema = z.enum(["superadmin", "member", "pending", "none"]);
export type PortalRole = z.infer<typeof PortalRoleSchema>;

export const AccessEmailSchema = z
  .string()
  .trim()
  .min(1)
  .max(254)
  .email()
  .transform((email) => email.toLowerCase());

export const AccessEmailRequestSchema = z.object({
  email: AccessEmailSchema,
});
export type AccessEmailRequest = z.infer<typeof AccessEmailRequestSchema>;

export const MeResponseSchema = z.object({
  email: AccessEmailSchema,
  role: PortalRoleSchema,
});
export type MeResponse = z.infer<typeof MeResponseSchema>;

export const AccessOkResponseSchema = z.object({
  ok: z.literal(true),
});
export type AccessOkResponse = z.infer<typeof AccessOkResponseSchema>;

export const AccessPersonSchema = z.object({
  email: AccessEmailSchema,
  createdAt: z.string().datetime(),
});
export type AccessPerson = z.infer<typeof AccessPersonSchema>;

export const AccessListResponseSchema = z.object({
  requests: z.array(AccessPersonSchema),
  enabled: z.array(AccessPersonSchema),
});
export type AccessListResponse = z.infer<typeof AccessListResponseSchema>;

export const CreateProjectRequestSchema = z
  .object({
    prompt: z.string().trim().max(50_000).optional().default(""),
    images: z.array(ImageBlockSchema).max(4).optional().default([]),
    name: z.string().trim().min(1).max(120).optional(),
    instructions: z.string().trim().max(10_000).optional(),
  })
  .refine((data) => data.prompt.length > 0 || data.images.length > 0, {
    message: "Provide a text prompt or at least one image",
    path: ["prompt"],
  });
export type CreateProjectRequest = z.infer<typeof CreateProjectRequestSchema>;

export const UpdateProjectRequestSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    instructions: z.string().trim().max(10_000).nullable().optional(),
    previewPort: z.number().int().min(1).max(65535).nullable().optional(),
    previewPath: z.string().trim().max(500).nullable().optional(),
  })
  .refine(
    (data) =>
      data.name !== undefined ||
      data.instructions !== undefined ||
      data.previewPort !== undefined ||
      data.previewPath !== undefined,
    { message: "At least one field must be provided" }
  );
export type UpdateProjectRequest = z.infer<typeof UpdateProjectRequestSchema>;

export const PaginationQuerySchema = z.object({
  cursor: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional().default(25),
});
export type PaginationQuery = z.infer<typeof PaginationQuerySchema>;

export const ProjectResponseSchema = z.object({
  id: z.string().uuid(),
  userId: z.string(),
  name: z.string(),
  instructions: z.string().nullable(),
  previewPort: z.number().int().nullable(),
  previewPath: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type ProjectResponse = z.infer<typeof ProjectResponseSchema>;

export const PaginatedProjectsResponseSchema = z.object({
  items: z.array(ProjectResponseSchema),
  nextCursor: z.string().nullable(),
});
export type PaginatedProjectsResponse = z.infer<
  typeof PaginatedProjectsResponseSchema
>;

export const SendMessageRequestSchema = z
  .object({
    prompt: z.string().trim().max(50_000).optional().default(""),
    images: z.array(ImageBlockSchema).max(4).optional().default([]),
  })
  .refine((data) => data.prompt.length > 0 || data.images.length > 0, {
    message: "Provide a message or at least one image",
    path: ["prompt"],
  });
export type SendMessageRequest = z.infer<typeof SendMessageRequestSchema>;

export const MessageResponseSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  runId: z.string().uuid().nullable(),
  role: RoleSchema,
  content: z.array(ContentBlockSchema),
  createdAt: z.string(),
});
export type MessageResponse = z.infer<typeof MessageResponseSchema>;

export const PaginatedMessagesResponseSchema = z.object({
  items: z.array(MessageResponseSchema),
  nextCursor: z.string().nullable(),
  activeRun: z
    .object({
      id: z.string().uuid(),
      status: RunStatusSchema,
    })
    .nullable()
    .optional(),
});
export type PaginatedMessagesResponse = z.infer<
  typeof PaginatedMessagesResponseSchema
>;

export const RunResponseSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  status: RunStatusSchema,
  error: z.string().nullable(),
  inputTokens: z.number().int(),
  outputTokens: z.number().int(),
  costMicros: z.number().int(),
  startedAt: z.string().nullable(),
  finishedAt: z.string().nullable(),
  createdAt: z.string(),
});
export type RunResponse = z.infer<typeof RunResponseSchema>;

export const CreateProjectWithRunResponseSchema = z.object({
  project: ProjectResponseSchema,
  message: MessageResponseSchema,
  run: RunResponseSchema,
});
export type CreateProjectWithRunResponse = z.infer<
  typeof CreateProjectWithRunResponseSchema
>;

export const SendMessageResponseSchema = z.object({
  message: MessageResponseSchema,
  run: RunResponseSchema,
});
export type SendMessageResponse = z.infer<typeof SendMessageResponseSchema>;

export const RunEventTypeSchema = z.enum([
  "status",
  "text_delta",
  "tool_call",
  "tool_result",
  "file_changed",
  "command_output",
  "preview",
  "error",
  "done",
]);
export type RunEventType = z.infer<typeof RunEventTypeSchema>;

export const RunEventSchema = z.object({
  id: z.string().uuid(),
  runId: z.string().uuid(),
  seq: z.number().int().nonnegative(),
  type: RunEventTypeSchema,
  payload: z.record(z.unknown()),
  createdAt: z.string(),
});
export type RunEvent = z.infer<typeof RunEventSchema>;

export const SandboxSessionResponseSchema = z.object({
  projectId: z.string().uuid(),
  status: SandboxStatusSchema,
  ideUrl: z.string().url(),
  previewUrl: z.string().url().nullable(),
  previewPort: z.number().int().nullable(),
  previewPath: z.string().nullable(),
  expiresAt: z.string(),
});
export type SandboxSessionResponse = z.infer<
  typeof SandboxSessionResponseSchema
>;

// Internal Sandbox Controller schemas
export const ControllerEnsureSandboxRequestSchema = z.object({
  projectId: z.string().uuid(),
  userId: z.string().min(1),
  previewPort: z.number().int().min(1).max(65535).nullable().optional(),
  previewPath: z.string().max(500).nullable().optional(),
  /** Defaults to true. The worker passes false so browser sessions survive a run. */
  rotateToken: z.boolean().optional(),
});
export type ControllerEnsureSandboxRequest = z.infer<
  typeof ControllerEnsureSandboxRequestSchema
>;

export const ControllerFileWriteRequestSchema = z.object({
  projectId: z.string().uuid(),
  userId: z.string().min(1),
  path: z.string().min(1).max(1024),
  content: z.string().max(5_000_000),
});
export type ControllerFileWriteRequest = z.infer<
  typeof ControllerFileWriteRequestSchema
>;

export const ControllerFileEditRequestSchema = z.object({
  projectId: z.string().uuid(),
  userId: z.string().min(1),
  path: z.string().min(1).max(1024),
  oldString: z.string().min(1),
  newString: z.string(),
  replaceAll: z.boolean().optional().default(false),
});
export type ControllerFileEditRequest = z.infer<
  typeof ControllerFileEditRequestSchema
>;

export const ControllerFilePathRequestSchema = z.object({
  projectId: z.string().uuid(),
  userId: z.string().min(1),
  path: z.string().max(1024).optional().default("."),
});
export type ControllerFilePathRequest = z.infer<
  typeof ControllerFilePathRequestSchema
>;

export const ControllerSearchRequestSchema = z.object({
  projectId: z.string().uuid(),
  userId: z.string().min(1),
  query: z.string().min(1).max(500),
  path: z.string().max(1024).optional().default("."),
});
export type ControllerSearchRequest = z.infer<
  typeof ControllerSearchRequestSchema
>;

export const ControllerExecRequestSchema = z.object({
  projectId: z.string().uuid(),
  userId: z.string().min(1),
  command: z.string().min(1).max(10_000),
  cwd: z.string().max(1024).optional().default("."),
  timeoutMs: z.number().int().min(1000).max(300_000).optional().default(120_000),
});
export type ControllerExecRequest = z.infer<typeof ControllerExecRequestSchema>;

export const ControllerProcessStartRequestSchema = z.object({
  projectId: z.string().uuid(),
  userId: z.string().min(1),
  name: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[a-zA-Z0-9_-]+$/, "Process name must be alphanumeric"),
  command: z.string().min(1).max(10_000),
  cwd: z.string().max(1024).optional().default("."),
  port: z.number().int().min(1024).max(65535).optional(),
});
export type ControllerProcessStartRequest = z.infer<
  typeof ControllerProcessStartRequestSchema
>;

export const ControllerProcessStopRequestSchema = z.object({
  projectId: z.string().uuid(),
  userId: z.string().min(1),
  name: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[a-zA-Z0-9_-]+$/),
});
export type ControllerProcessStopRequest = z.infer<
  typeof ControllerProcessStopRequestSchema
>;

export function deriveProjectName(prompt: string): string {
  const cleaned = prompt
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[^\w\s-]/g, "");
  if (!cleaned) {
    return "Untitled Project";
  }
  const words = cleaned.split(" ").slice(0, 6).join(" ");
  return words.slice(0, 80);
}

export function buildPlatformOpenApiSpec() {
  return {
    openapi: "3.1.0",
    info: {
      title: "Software Agent Platform API",
      version: "1.0.0",
      description:
        "Versioned REST + SSE API for the generic AI software agent platform.",
    },
    servers: [{ url: "/v1" }],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
        },
      },
    },
    security: [{ bearerAuth: [] }],
    paths: {
      "/projects": {
        get: { summary: "List caller's projects (cursor paginated)" },
        post: {
          summary:
            "Create project, initial user message, and enqueue agent run atomically",
        },
      },
      "/projects/{projectId}": {
        get: { summary: "Get project details" },
        patch: { summary: "Update project name, instructions, or preview" },
        delete: { summary: "Delete project, cascade records, destroy sandbox" },
      },
      "/projects/{projectId}/messages": {
        get: { summary: "List messages in project (cursor paginated)" },
        post: { summary: "Send a new user message and enqueue a run" },
      },
      "/projects/{projectId}/sandbox": {
        post: { summary: "Ensure sandbox and return signed IDE & preview URLs" },
        delete: { summary: "Stop project sandbox" },
      },
      "/projects/{projectId}/files": {
        get: { summary: "List or read files from project workspace" },
      },
      "/projects/{projectId}/export": {
        get: { summary: "Export project workspace as a tar.gz archive" },
      },
      "/runs/{runId}/events": {
        get: {
          summary:
            "Stream run events over Server-Sent Events with Last-Event-ID replay",
        },
      },
      "/runs/{runId}/cancel": {
        post: { summary: "Cancel an active or queued run" },
      },
      "/me": {
        get: { summary: "Current caller email and portal role" },
      },
      "/access/request": {
        post: { summary: "Request access for the signed-in email" },
        delete: { summary: "Dismiss a pending access request (superadmin)" },
      },
      "/access": {
        get: { summary: "List pending requests and enabled people (superadmin)" },
        post: { summary: "Enable an email (superadmin)" },
        delete: { summary: "Remove an enabled person (superadmin)" },
      },
    },
  };
}
