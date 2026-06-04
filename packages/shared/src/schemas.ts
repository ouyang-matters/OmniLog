/**
 * Zod schemas for API request/response validation. The client uses these to
 * validate before sending and after receiving; the Rust server enforces the
 * same contracts independently.
 */
import { z } from "zod";

export const syncStatusSchema = z.enum(["local", "synced", "dirty", "conflict"]);

export const worklogEntrySchema = z.object({
  _id: z.string(),
  userId: z.string(),
  title: z.string(),
  date: z.string(),
  contentJson: z.unknown(),
  contentText: z.string(),
  contentHtml: z.string().optional(),
  tags: z.array(z.string()),
  createdAt: z.string(),
  updatedAt: z.string(),
  deletedAt: z.string().nullable().optional(),
  version: z.number(),
  syncStatus: syncStatusSchema,
  deviceId: z.string(),
  contentHash: z.string().optional(),
});

export const entryModeSchema = z.enum(["rich", "latex", "markdown"]);

/** Body for POST /api/entries. Server fills in ids/timestamps/version. */
export const createEntryInputSchema = z.object({
  folderId: z.string().nullable().optional(),
  title: z.string().default(""),
  date: z.string(),
  contentJson: z.unknown(),
  contentText: z.string().default(""),
  contentHtml: z.string().optional(),
  tags: z.array(z.string()).default([]),
  deviceId: z.string(),
  contentHash: z.string().optional(),
  mode: entryModeSchema.optional(),
});

/** Body for PATCH /api/entries/:id. All fields optional (partial update). */
export const updateEntryInputSchema = z.object({
  folderId: z.string().optional(),
  title: z.string().optional(),
  date: z.string().optional(),
  contentJson: z.unknown().optional(),
  contentText: z.string().optional(),
  contentHtml: z.string().optional(),
  tags: z.array(z.string()).optional(),
  deviceId: z.string().optional(),
  contentHash: z.string().optional(),
  mode: entryModeSchema.optional(),
  /** Optimistic-concurrency check; server rejects with 409 on mismatch. */
  baseVersion: z.number().optional(),
});

export const assetSchema = z.object({
  _id: z.string(),
  userId: z.string(),
  entryId: z.string(),
  type: z.literal("image"),
  fileName: z.string(),
  originalName: z.string().optional(),
  mimeType: z.string(),
  size: z.number(),
  storagePath: z.string(),
  publicUrl: z.string().optional(),
  width: z.number().optional(),
  height: z.number().optional(),
  caption: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
  contentHash: z.string().optional(),
});

export const healthResponseSchema = z.object({
  ok: z.boolean(),
  name: z.string(),
  version: z.string(),
});

export const serverConfigSchema = z.object({
  mode: z.enum(["custom", "official"]),
  serverUrl: z.string(),
  apiToken: z.string(),
  deviceName: z.string(),
  deviceId: z.string(),
  managedLocal: z.boolean().optional(),
});

export const exportInputSchema = z.object({
  format: z.enum(["json", "markdown"]).default("json"),
  entryIds: z.array(z.string()).optional(),
});

export const exportResultSchema = z.object({
  fileName: z.string(),
  storagePath: z.string(),
  format: z.enum(["json", "markdown"]),
  count: z.number(),
  createdAt: z.string(),
});

export type CreateEntryInput = z.infer<typeof createEntryInputSchema>;
export type UpdateEntryInput = z.infer<typeof updateEntryInputSchema>;
export type ExportInput = z.infer<typeof exportInputSchema>;
export type ExportResult = z.infer<typeof exportResultSchema>;
