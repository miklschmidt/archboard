import { z } from "zod";

import { parseRealtimeItemId, parseRealtimeSessionId } from "../../codex-realtime-host/index.js";
import type { RealtimeItemId, RealtimeSessionId } from "../../codex-realtime-host/index.js";
import { boundedText } from "./scalars.js";
import type { IdentitySchemas } from "./scalars.js";

const BROWSER_SPOKEN_APPROVAL_STATES = Object.freeze([
	"idle",
	"armed",
	"resolving",
	"settled",
	"expired",
	"visual_fallback",
	"outcome_unknown",
	"stale_session",
] as const);

const BROWSER_SPOKEN_APPROVAL_REASONS = Object.freeze([
	"approval_unavailable",
	"not_eligible",
	"coordinator_unavailable",
	"realtime_unavailable",
	"invalid_context",
	"invalid_effect_prompt",
	"user_already_spoke",
	"missing_user_final",
	"assistant_only",
	"ambiguous",
	"changed_effect",
	"stale_realtime_session",
	"stale_state",
	"timeout",
	"classifier_lost",
	"resolver_lost",
	"child_exit",
	"disposed",
] as const);

const BROWSER_IDLE_SPOKEN_APPROVAL = Object.freeze({
	kind: "spoken_approval" as const,
	state: "idle" as const,
	approval: null,
	gate: null,
	capturedUserFinal: null,
	settlement: null,
	reason: null,
});

const CORE_STATES = new Set([
	"armed",
	"resolving",
	"settled",
	"expired",
	"outcome_unknown",
] as const);

function realtimeIdentity<Identity extends RealtimeItemId | RealtimeSessionId>(
	parse: (value: unknown) => Identity,
): z.ZodType<Identity> {
	return z.unknown().transform((value, context) => {
		try {
			return parse(value);
		} catch (error) {
			context.addIssue({
				code: "custom",
				message: error instanceof Error ? error.message : "realtime identity is invalid",
			});
			return z.NEVER;
		}
	});
}

function createBrowserSpokenApprovalSchema(identity: IdentitySchemas) {
	const {
		ApprovalIdSchema,
		ChildEpochSchema,
		ChildIdSchema,
		JsonRpcRequestIdSchema,
		ThreadIdSchema,
	} = identity;
	const RealtimeItemIdSchema = realtimeIdentity(parseRealtimeItemId);
	const RealtimeSessionIdSchema = realtimeIdentity(parseRealtimeSessionId);
	const ReasonSchema = z.enum(BROWSER_SPOKEN_APPROVAL_REASONS);
	const ApprovalSchema = z
		.object({
			requestId: JsonRpcRequestIdSchema,
			approvalId: ApprovalIdSchema.nullable(),
			threadId: ThreadIdSchema,
			binding: z
				.object({
					child: ChildIdSchema,
					epoch: ChildEpochSchema,
					target: boundedText(512),
					effect: boundedText(512),
				})
				.strict(),
		})
		.strict();
	const GateSchema = z
		.object({
			coordinatorThreadId: ThreadIdSchema,
			realtimeSessionId: RealtimeSessionIdSchema,
			effectSummary: boundedText(512),
			effectFingerprint: boundedText(512),
			effectPrompt: z
				.object({ itemId: RealtimeItemIdSchema, sequence: z.number().int().nonnegative() })
				.strict(),
			expiresAtMs: z.number().int().nonnegative(),
		})
		.strict();
	const CapturedUserFinalSchema = z
		.object({
			itemId: RealtimeItemIdSchema,
			sequence: z.number().int().nonnegative(),
			text: boundedText(16_384),
		})
		.strict();
	const SettlementSchema = z
		.object({
			state: z.enum(["settled", "expired", "cancelled", "stale", "outcome_unknown"]),
			outcome: z.enum(["delivered", "not_delivered", "outcome_unknown"]),
			reason: boundedText(512),
		})
		.strict();

	return z
		.object({
			kind: z.literal("spoken_approval"),
			state: z.enum(BROWSER_SPOKEN_APPROVAL_STATES),
			approval: ApprovalSchema.nullable(),
			gate: GateSchema.nullable(),
			capturedUserFinal: CapturedUserFinalSchema.nullable(),
			settlement: SettlementSchema.nullable(),
			reason: ReasonSchema.nullable(),
		})
		.strict()
		.superRefine((value, context) => {
			const resolverOutcomeUnknown =
				value.settlement === null || value.settlement.outcome === "outcome_unknown";
			if (value.state === "idle") {
				if (
					value.approval !== null ||
					value.gate !== null ||
					value.capturedUserFinal !== null ||
					value.settlement !== null ||
					value.reason !== null
				) {
					context.addIssue({
						code: "custom",
						path: ["state"],
						message: "an idle spoken approval cannot retain request state",
					});
				}
				return;
			}
			if (
				CORE_STATES.has(value.state as never) &&
				(value.approval === null || value.gate === null)
			) {
				context.addIssue({
					code: "custom",
					path: ["state"],
					message: "this spoken approval state requires an exact approval and gate identity",
				});
			}
			if (
				(value.state === "resolving" ||
					value.state === "settled" ||
					value.state === "outcome_unknown") &&
				value.capturedUserFinal === null
			) {
				context.addIssue({
					code: "custom",
					path: ["capturedUserFinal"],
					message: "this spoken approval state requires the exact captured final user item",
				});
			}
			if (value.state === "armed" && value.capturedUserFinal !== null) {
				context.addIssue({
					code: "custom",
					path: ["capturedUserFinal"],
					message: "an armed spoken approval has not captured its user item yet",
				});
			}
			if (value.state === "settled" && value.settlement === null) {
				context.addIssue({
					code: "custom",
					path: ["settlement"],
					message: "a settled spoken approval requires its ordinary approval settlement",
				});
			}
			if (value.state === "expired" && value.reason !== "timeout") {
				context.addIssue({
					code: "custom",
					path: ["reason"],
					message: "only the runtime timeout reason produces an expired spoken approval",
				});
			}
			if (
				value.state === "outcome_unknown" &&
				(value.reason !== "resolver_lost" || !resolverOutcomeUnknown)
			) {
				context.addIssue({
					code: "custom",
					path: ["reason"],
					message:
						"only a lost resolver result without a known settlement produces an unknown spoken outcome",
				});
			}
			if (
				value.state === "stale_session" &&
				value.reason !== "changed_effect" &&
				value.reason !== "stale_realtime_session" &&
				value.reason !== "stale_state"
			) {
				context.addIssue({
					code: "custom",
					path: ["reason"],
					message: "a stale spoken approval requires an identity or realtime mismatch",
				});
			}
			if (value.reason === "timeout" && value.state !== "expired") {
				context.addIssue({
					code: "custom",
					path: ["state"],
					message: "the runtime timeout reason must be presented as expired",
				});
			}
			if (value.reason === "resolver_lost") {
				const expectedState = resolverOutcomeUnknown ? "outcome_unknown" : "visual_fallback";
				if (value.state !== expectedState) {
					context.addIssue({
						code: "custom",
						path: ["state"],
						message: resolverOutcomeUnknown
							? "a lost resolver without a known settlement must be presented as outcome unknown"
							: "a lost resolver with a known settlement must preserve that truth as visual fallback",
					});
				}
				if (value.approval === null || value.gate === null || value.capturedUserFinal === null) {
					context.addIssue({
						code: "custom",
						path: ["reason"],
						message: "a lost resolver requires its exact approval, gate, and captured user item",
					});
				}
			}
			if (
				(value.reason === "changed_effect" ||
					value.reason === "stale_realtime_session" ||
					value.reason === "stale_state") &&
				value.state !== "stale_session"
			) {
				context.addIssue({
					code: "custom",
					path: ["state"],
					message: "an identity or realtime mismatch must be presented as stale",
				});
			}
			if (value.state === "visual_fallback" && value.reason === null) {
				context.addIssue({
					code: "custom",
					path: ["reason"],
					message: "a visual spoken fallback requires the runtime reason",
				});
			}
			if (
				(value.state === "armed" || value.state === "resolving" || value.state === "settled") &&
				value.reason !== null
			) {
				context.addIssue({
					code: "custom",
					path: ["reason"],
					message: "a live or settled spoken approval cannot carry a fallback reason",
				});
			}
		});
}

type BrowserSpokenApproval = z.infer<ReturnType<typeof createBrowserSpokenApprovalSchema>>;

export {
	BROWSER_SPOKEN_APPROVAL_STATES,
	BROWSER_SPOKEN_APPROVAL_REASONS,
	BROWSER_IDLE_SPOKEN_APPROVAL,
	createBrowserSpokenApprovalSchema,
	type BrowserSpokenApproval,
};
