import { z } from "zod";

import { parseRealtimeItemId, parseRealtimeSessionId } from "@/shared/codex-realtime-host/index";
import type { RealtimeItemId, RealtimeSessionId } from "@/shared/codex-realtime-host/index";
import { boundedText } from "@/shared/codex-browser-model/lib/scalars";
import type { IdentitySchemas } from "@/shared/codex-browser-model/lib/scalars";

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

type SpokenApprovalState = (typeof BROWSER_SPOKEN_APPROVAL_STATES)[number];
type SpokenApprovalReason = (typeof BROWSER_SPOKEN_APPROVAL_REASONS)[number];

/** The states that only exist for one exact approval and gate. */
const CORE_STATES: ReadonlySet<SpokenApprovalState> = new Set<SpokenApprovalState>([
	"armed",
	"resolving",
	"settled",
	"expired",
	"outcome_unknown",
]);
/** The states that have already captured the user's final spoken item. */
const CAPTURED_STATES: ReadonlySet<SpokenApprovalState> = new Set<SpokenApprovalState>([
	"resolving",
	"settled",
	"outcome_unknown",
]);
/** The states in which no fallback reason may be shown. */
const LIVE_STATES: ReadonlySet<SpokenApprovalState> = new Set<SpokenApprovalState>([
	"armed",
	"resolving",
	"settled",
]);
/** The reasons that mean the spoken session no longer describes this approval. */
const STALE_REASONS: ReadonlySet<SpokenApprovalReason> = new Set<SpokenApprovalReason>([
	"changed_effect",
	"stale_realtime_session",
	"stale_state",
]);

/** The fields the consistency rules read; the schemas decide the exact shapes. */
interface SpokenApprovalFacts {
	readonly state: SpokenApprovalState;
	readonly reason: SpokenApprovalReason | null;
	readonly approval: object | null;
	readonly gate: object | null;
	readonly capturedUserFinal: object | null;
	readonly settlement: { readonly outcome: string } | null;
}

/** One consistency rule: when `broken` holds, the issue is recorded at `path`. */
interface SpokenApprovalRule {
	readonly broken: (value: SpokenApprovalFacts) => boolean;
	readonly path: readonly string[];
	readonly message: string;
}

/**
 * Tells whether the resolver's outcome is unknown: no settlement, or one
 * whose delivery outcome is itself unknown.
 * @param value - The spoken approval.
 * @returns True when no settled outcome is known.
 */
function resolverOutcomeUnknown(value: SpokenApprovalFacts): boolean {
	return value.settlement === null || value.settlement.outcome === "outcome_unknown";
}

/**
 * Tells whether a state that requires the exact approval, gate and captured
 * user item lacks any of them.
 * @param value - The spoken approval.
 * @returns True when any of the three is missing.
 */
function lacksResolverIdentity(value: SpokenApprovalFacts): boolean {
	return value.approval === null || value.gate === null || value.capturedUserFinal === null;
}

/**
 * The rule an idle approval must satisfy: it retains nothing.
 * @param value - The spoken approval.
 * @returns True when any request state is still present.
 */
function idleRetainsState(value: SpokenApprovalFacts): boolean {
	return (
		value.approval !== null ||
		value.gate !== null ||
		value.capturedUserFinal !== null ||
		value.settlement !== null ||
		value.reason !== null
	);
}

/** The rules a non-idle spoken approval must satisfy, in the order their issues are reported. */
const SPOKEN_APPROVAL_RULES: readonly SpokenApprovalRule[] = [
	{
		/**
		 * Broken when a core state lacks its approval or gate.
		 * @param value - The spoken approval.
		 * @returns True when a core state lacks its approval or gate.
		 */
		broken: (value) =>
			CORE_STATES.has(value.state) && (value.approval === null || value.gate === null),
		path: ["state"],
		message: "this spoken approval state requires an exact approval and gate identity",
	},
	{
		/**
		 * Broken when a captured state has no captured user item.
		 * @param value - The spoken approval.
		 * @returns True when a captured state has no captured user item.
		 */
		broken: (value) => CAPTURED_STATES.has(value.state) && value.capturedUserFinal === null,
		path: ["capturedUserFinal"],
		message: "this spoken approval state requires the exact captured final user item",
	},
	{
		/**
		 * Broken when an armed approval already holds a captured user item.
		 * @param value - The spoken approval.
		 * @returns True when an armed approval already holds a captured user item.
		 */
		broken: (value) => value.state === "armed" && value.capturedUserFinal !== null,
		path: ["capturedUserFinal"],
		message: "an armed spoken approval has not captured its user item yet",
	},
	{
		/**
		 * Broken when a settled approval has no settlement.
		 * @param value - The spoken approval.
		 * @returns True when a settled approval has no settlement.
		 */
		broken: (value) => value.state === "settled" && value.settlement === null,
		path: ["settlement"],
		message: "a settled spoken approval requires its ordinary approval settlement",
	},
	{
		/**
		 * Broken when an expired approval has a reason other than the timeout.
		 * @param value - The spoken approval.
		 * @returns True when an expired approval has a reason other than the timeout.
		 */
		broken: (value) => value.state === "expired" && value.reason !== "timeout",
		path: ["reason"],
		message: "only the runtime timeout reason produces an expired spoken approval",
	},
	{
		/**
		 * Broken when an unknown outcome is not a lost resolver without a known settlement.
		 * @param value - The spoken approval.
		 * @returns True when an unknown outcome is not a lost resolver without a known settlement.
		 */
		broken: (value) =>
			value.state === "outcome_unknown" &&
			(value.reason !== "resolver_lost" || !resolverOutcomeUnknown(value)),
		path: ["reason"],
		message:
			"only a lost resolver result without a known settlement produces an unknown spoken outcome",
	},
	{
		/**
		 * Broken when a stale session has a reason that is not a mismatch.
		 * @param value - The spoken approval.
		 * @returns True when a stale session has a reason that is not a mismatch.
		 */
		broken: (value) =>
			value.state === "stale_session" &&
			(value.reason === null || !STALE_REASONS.has(value.reason)),
		path: ["reason"],
		message: "a stale spoken approval requires an identity or realtime mismatch",
	},
	{
		/**
		 * Broken when the timeout reason is shown in a state other than expired.
		 * @param value - The spoken approval.
		 * @returns True when the timeout reason is shown in a state other than expired.
		 */
		broken: (value) => value.reason === "timeout" && value.state !== "expired",
		path: ["state"],
		message: "the runtime timeout reason must be presented as expired",
	},
	{
		/**
		 * Broken when a lost resolver with no known settlement is not shown as outcome unknown.
		 * @param value - The spoken approval.
		 * @returns True when a lost resolver with no known settlement is not shown as outcome unknown.
		 */
		broken: (value) =>
			value.reason === "resolver_lost" &&
			resolverOutcomeUnknown(value) &&
			value.state !== "outcome_unknown",
		path: ["state"],
		message: "a lost resolver without a known settlement must be presented as outcome unknown",
	},
	{
		/**
		 * Broken when a lost resolver with a known settlement is not shown as visual fallback.
		 * @param value - The spoken approval.
		 * @returns True when a lost resolver with a known settlement is not shown as visual fallback.
		 */
		broken: (value) =>
			value.reason === "resolver_lost" &&
			!resolverOutcomeUnknown(value) &&
			value.state !== "visual_fallback",
		path: ["state"],
		message: "a lost resolver with a known settlement must preserve that truth as visual fallback",
	},
	{
		/**
		 * Broken when a lost resolver lacks its approval, gate or captured user item.
		 * @param value - The spoken approval.
		 * @returns True when a lost resolver lacks its approval, gate or captured user item.
		 */
		broken: (value) => value.reason === "resolver_lost" && lacksResolverIdentity(value),
		path: ["reason"],
		message: "a lost resolver requires its exact approval, gate, and captured user item",
	},
	{
		/**
		 * Broken when a mismatch reason is shown in a state other than stale.
		 * @param value - The spoken approval.
		 * @returns True when a mismatch reason is shown in a state other than stale.
		 */
		broken: (value) =>
			value.reason !== null && STALE_REASONS.has(value.reason) && value.state !== "stale_session",
		path: ["state"],
		message: "an identity or realtime mismatch must be presented as stale",
	},
	{
		/**
		 * Broken when a visual fallback carries no reason.
		 * @param value - The spoken approval.
		 * @returns True when a visual fallback carries no reason.
		 */
		broken: (value) => value.state === "visual_fallback" && value.reason === null,
		path: ["reason"],
		message: "a visual spoken fallback requires the runtime reason",
	},
	{
		/**
		 * Broken when a live or settled approval carries a fallback reason.
		 * @param value - The spoken approval.
		 * @returns True when a live or settled approval carries a fallback reason.
		 */
		broken: (value) => LIVE_STATES.has(value.state) && value.reason !== null,
		path: ["reason"],
		message: "a live or settled spoken approval cannot carry a fallback reason",
	},
];

/**
 * Applies the consistency rules to a parsed spoken approval: an idle record
 * must be empty; any other must agree with the rule table.
 * @param value - The spoken approval.
 * @param context - Where issues are recorded.
 */
function validateSpokenApproval(value: SpokenApprovalFacts, context: z.RefinementCtx): void {
	if (value.state === "idle") {
		if (idleRetainsState(value)) {
			context.addIssue({
				code: "custom",
				path: ["state"],
				message: "an idle spoken approval cannot retain request state",
			});
		}
		return;
	}
	for (const rule of SPOKEN_APPROVAL_RULES) {
		if (rule.broken(value)) {
			context.addIssue({ code: "custom", path: [...rule.path], message: rule.message });
		}
	}
}

/**
 * Wraps a realtime identity parser as a zod schema, so a refusal surfaces as
 * a validation issue instead of a throw.
 * @param parse - The parser for one realtime identity kind.
 * @returns A schema that yields the branded identity or an issue.
 */
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

/**
 * Builds the schema of the spoken-approval record the pane shows: which
 * approval voice may settle, the gate that armed it, what the person said,
 * and how it settled, with the consistency rules between those parts.
 * @param identity - The session's identity schemas.
 * @returns The strict, rule-checked schema.
 */
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
		.superRefine(validateSpokenApproval);
}

type BrowserSpokenApproval = z.infer<ReturnType<typeof createBrowserSpokenApprovalSchema>>;

export {
	BROWSER_SPOKEN_APPROVAL_STATES,
	BROWSER_SPOKEN_APPROVAL_REASONS,
	BROWSER_IDLE_SPOKEN_APPROVAL,
	createBrowserSpokenApprovalSchema,
	type BrowserSpokenApproval,
};
