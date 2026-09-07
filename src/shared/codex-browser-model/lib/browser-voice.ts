// The voice-side DTOs: the coordinator that voice talks to, the realtime
// session and its transcript, the context ledger voice was given, and the
// semantic delivery receipt that ties a pane's meaning to a thread.

import { z } from "zod";

import { parseRealtimeSessionId as parseBrowserRealtimeSessionId } from "@/shared/codex-realtime-host/index";
import {
	BROWSER_VOICE_CONTEXT_BODY_MAX_UTF8_BYTES,
	BROWSER_VOICE_CONTEXT_BRIEF_MAX_UTF8_BYTES,
	BROWSER_VOICE_CONTEXT_ENTRY_LIMIT,
	DeliveryOutcomeSchema,
	TimestampSchema,
} from "@/shared/codex-browser-model/lib/browser-vocabulary";
import {
	boundedText,
	boundedWireText,
	optionalNullableText,
} from "@/shared/codex-browser-model/lib/scalars";
import type { IdentitySchemas } from "@/shared/codex-browser-model/lib/scalars";

/**
 * Builds the semantic delivery, coordinator, voice and voice context schemas.
 * @param identity - The session's identity schemas.
 * @returns The four schemas and the realtime session id schema they share.
 */
function createBrowserVoiceSchemas(identity: IdentitySchemas) {
	const { ItemIdSchema, ThreadIdSchema, TurnIdSchema } = identity;
	const NullableReasonSchema = optionalNullableText(512);
	const BrowserRealtimeSessionIdSchema = z
		.string()
		.min(1)
		.refine((value) => !value.includes("\0"), "NUL is not allowed")
		.transform(parseBrowserRealtimeSessionId);

	const BrowserSemanticDeliverySchema = z
		.object({
			kind: z.literal("semantic_delivery"),
			threadId: ThreadIdSchema,
			delivery: DeliveryOutcomeSchema,
			capturedAtMs: TimestampSchema,
			freshUntilMs: TimestampSchema,
			reason: NullableReasonSchema,
		})
		.strict();
	const BrowserCoordinatorSchema = z
		.object({
			kind: z.literal("coordinator"),
			state: z.enum(["unbound", "starting", "ready", "active", "reconnecting", "failed"]),
			threadId: ThreadIdSchema.nullable(),
			activeTurnId: TurnIdSchema.nullable(),
			configuredModel: boundedText(256).nullable(),
			configuredEffort: boundedText(64).nullable(),
			model: boundedText(256).nullable(),
			effort: boundedText(64).nullable(),
			serviceTier: boundedText(64).nullable(),
			reason: NullableReasonSchema,
		})
		.strict()
		.superRefine((value, refinementContext) => {
			if (value.state === "unbound" && (value.threadId !== null || value.activeTurnId !== null)) {
				refinementContext.addIssue({
					code: "custom",
					path: ["state"],
					message: "an unbound coordinator cannot publish thread or turn state",
				});
			}
			if (value.activeTurnId !== null && value.threadId === null) {
				refinementContext.addIssue({
					code: "custom",
					path: ["activeTurnId"],
					message: "an active coordinator turn requires a coordinator thread",
				});
			}
		});
	const BrowserVoiceSchema = z
		.object({
			kind: z.literal("voice"),
			state: z.enum([
				"unavailable",
				"ready",
				"starting",
				"active",
				"recovering",
				"stopping",
				"failed",
			]),
			realtimeSessionId: BrowserRealtimeSessionIdSchema.nullable(),
			transcript: z.array(
				z
					.object({
						itemId: ItemIdSchema,
						sequence: z.number().int().nonnegative(),
						speaker: z.enum(["user", "assistant"]),
						text: boundedText(16_384),
						final: z.boolean(),
					})
					.strict(),
			),
			delivery: DeliveryOutcomeSchema.nullable(),
			reason: NullableReasonSchema,
		})
		.strict();
	const BrowserVoiceContextEntryBaseSchema = z
		.object({
			id: boundedText(2048),
			kind: z.enum(["semantic", "focus", "selection", "callback"]),
			sourceOrder: z.number().int().nonnegative(),
			capturedAtMs: TimestampSchema,
			freshUntilMs: TimestampSchema,
			reason: boundedText(512).nullable(),
			body: boundedWireText(BROWSER_VOICE_CONTEXT_BODY_MAX_UTF8_BYTES),
		})
		.strict();
	const BrowserVoiceContextEntrySchema = z
		.discriminatedUnion("attempted", [
			BrowserVoiceContextEntryBaseSchema.extend({
				attempted: z.literal(false),
				attemptedAtMs: z.null(),
				outcome: z.literal("not_delivered"),
			}),
			BrowserVoiceContextEntryBaseSchema.extend({
				attempted: z.literal(true),
				attemptedAtMs: TimestampSchema,
				outcome: DeliveryOutcomeSchema,
			}),
		])
		.superRefine((value, refinementContext) => {
			if (value.freshUntilMs < value.capturedAtMs) {
				refinementContext.addIssue({
					code: "custom",
					path: ["freshUntilMs"],
					message: "freshness cannot end before capture",
				});
			}
			if (value.attempted && value.attemptedAtMs < value.capturedAtMs) {
				refinementContext.addIssue({
					code: "custom",
					path: ["attemptedAtMs"],
					message: "attempt timing and delivery outcome are incoherent",
				});
			}
		});
	const BrowserVoiceContextSchema = z
		.object({
			kind: z.literal("voice_context"),
			sessionId: BrowserRealtimeSessionIdSchema,
			ledgerId: boundedText(2048),
			canonicalBrief: boundedText(BROWSER_VOICE_CONTEXT_BRIEF_MAX_UTF8_BYTES),
			ownerEntriesTruncated: z.number().int().nonnegative(),
			entriesTruncated: z.number().int().nonnegative(),
			entries: z.array(BrowserVoiceContextEntrySchema).max(BROWSER_VOICE_CONTEXT_ENTRY_LIMIT),
		})
		.strict()
		.superRefine((value, refinementContext) => {
			if (value.entriesTruncated < value.ownerEntriesTruncated) {
				refinementContext.addIssue({
					code: "custom",
					path: ["entriesTruncated"],
					message: "transport omissions cannot be less than permanent owner omissions",
				});
			}
		});

	return {
		BrowserSemanticDeliverySchema,
		BrowserCoordinatorSchema,
		BrowserVoiceSchema,
		BrowserVoiceContextSchema,
	};
}

export { createBrowserVoiceSchemas };
