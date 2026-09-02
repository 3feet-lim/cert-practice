import { z } from "zod";

import { stateVersionSchema, utcTimestampSchema, uuidSchema } from "./common.js";

export const approvalStatusSchema = z.enum(["pending", "approved"]);
export const userRoleSchema = z.enum(["user", "admin"]);

export const approvalStatusDtoSchema = z
  .object({
    approvalStatus: approvalStatusSchema,
  })
  .strict();

export const currentUserDtoSchema = z
  .object({
    id: uuidSchema,
    displayName: z.string().min(1).max(200),
    email: z.email(),
    role: userRoleSchema,
    approvalStatus: approvalStatusSchema,
    scorePublic: z.boolean(),
    stateVersion: stateVersionSchema,
  })
  .strict();

export const updateScoreVisibilityRequestSchema = z
  .object({
    scorePublic: z.boolean(),
    expectedVersion: stateVersionSchema,
  })
  .strict();

export const updateScoreVisibilityResponseSchema = z
  .object({
    scorePublic: z.boolean(),
    stateVersion: stateVersionSchema,
  })
  .strict();

export const pendingUserDtoSchema = z
  .object({
    id: uuidSchema,
    displayName: z.string().min(1).max(200),
    email: z.email(),
    firstLoginAt: utcTimestampSchema,
  })
  .strict();

export const pendingUsersDtoSchema = z
  .object({
    users: z.array(pendingUserDtoSchema),
  })
  .strict();

export const approveUserResponseSchema = z
  .object({
    userId: uuidSchema,
    approvalStatus: z.literal("approved"),
  })
  .strict();

export type ApprovalStatus = z.infer<typeof approvalStatusSchema>;
export type UserRole = z.infer<typeof userRoleSchema>;
export type ApprovalStatusDto = z.infer<typeof approvalStatusDtoSchema>;
export type CurrentUserDto = z.infer<typeof currentUserDtoSchema>;
export type UpdateScoreVisibilityRequest = z.infer<
  typeof updateScoreVisibilityRequestSchema
>;
export type UpdateScoreVisibilityResponse = z.infer<
  typeof updateScoreVisibilityResponseSchema
>;
export type PendingUserDto = z.infer<typeof pendingUserDtoSchema>;
export type PendingUsersDto = z.infer<typeof pendingUsersDtoSchema>;
export type ApproveUserResponse = z.infer<typeof approveUserResponseSchema>;
