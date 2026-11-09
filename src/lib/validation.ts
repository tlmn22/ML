import { z } from "zod";

/** MLBB Game ID: digits only, as shown in-game. */
export const roleIdSchema = z.coerce.number().int().min(1).max(99_999_999_999);
/** MLBB Server ID: the number in parentheses next to the Game ID. */
export const zoneIdSchema = z.coerce.number().int().min(1).max(999_999);

export const startVerificationSchema = z.object({
  roleId: roleIdSchema,
  zoneId: zoneIdSchema,
  consent: z.literal(true),
});

export const completeVerificationSchema = z.object({
  attemptId: z.uuid(),
  code: z.string().trim().regex(/^\d{4,6}$/),
});

export const manualVerificationSchema = z.object({
  roleId: roleIdSchema,
  zoneId: zoneIdSchema,
  note: z.string().trim().max(500).optional().default(""),
});

export const usernameSchema = z.string().trim().toLowerCase().regex(/^[a-z0-9_]{3,20}$/);
