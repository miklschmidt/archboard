import { z } from "zod";

import { boundedText } from "@/shared/codex-browser-model/lib/scalars";
import type { IdentityContext, IdentitySchemas } from "@/shared/codex-browser-model/lib/scalars";

const DYNAMIC_APPROVAL_NAMESPACE = "archboard_app" as const;
const DYNAMIC_APPROVAL_TOOLS = ["create_thread", "fork_thread", "send_message_to_thread"] as const;
const DYNAMIC_APPROVAL_DECISIONS = ["approve", "decline"] as const;
const DYNAMIC_APPROVAL_STATES = [
	"pending",
	"approved",
	"declined",
	"expired",
	"cancelled",
	"disconnected",
	"stale",
	"delivered",
	"not_delivered",
	"outcome_unknown",
] as const;

const AuthorityTokenSchema = boundedText(4096);

/**
 * Records one custom validation issue at a path.
 * @param context - The refinement context of the schema being checked.
 * @param path - Where in the value the issue sits.
 * @param message - What is wrong.
 */
function addIssue(context: z.RefinementCtx, path: string[], message: string): void {
	context.addIssue({ code: "custom", path, message });
}

/** The parts of a fork effect that decide whether it may start a turn. */
interface ForkTurnFacts {
	readonly arguments: { readonly prompt: string | null };
	readonly mutationOperationId: string;
	readonly initialTurnOperationId: string | null;
}

/**
 * Checks that a fork starts a turn exactly when it carries a prompt, and that
 * the turn has an operation id of its own rather than reusing the mutation's.
 * @param effect - A fork effect, in either its canonical or browser form.
 * @param refinementContext - Where issues are recorded.
 */
function validateForkInitialTurn(effect: ForkTurnFacts, refinementContext: z.RefinementCtx): void {
	if (effect.arguments.prompt === null && effect.initialTurnOperationId !== null) {
		addIssue(refinementContext, ["initialTurnOperationId"], "unprompted fork cannot start a turn");
	}
	if (effect.arguments.prompt !== null && effect.initialTurnOperationId === null) {
		addIssue(
			refinementContext,
			["initialTurnOperationId"],
			"prompted fork requires an initial turn",
		);
	}
	if (
		effect.initialTurnOperationId !== null &&
		effect.initialTurnOperationId === effect.mutationOperationId
	) {
		addIssue(
			refinementContext,
			["initialTurnOperationId"],
			"fork initial turn needs its own OperationId",
		);
	}
}

/**
 * Checks that a create effect's initial turn has an operation id of its own.
 * @param effect - An effect of any tool; only `create_thread` is checked.
 * @param refinementContext - Where issues are recorded.
 */
function validateCreateInitialTurn(
	effect: {
		readonly tool: string;
		readonly mutationOperationId: string;
		readonly initialTurnOperationId: string | null;
	},
	refinementContext: z.RefinementCtx,
): void {
	if (
		effect.tool === "create_thread" &&
		effect.initialTurnOperationId === effect.mutationOperationId
	) {
		addIssue(
			refinementContext,
			["initialTurnOperationId"],
			"create initial turn needs its own OperationId",
		);
	}
}

/**
 * Checks that a browser effect's target echoes the thread its arguments name,
 * so the pane can never show one thread while the call acts on another.
 * @param effect - A fork or send effect in its browser form.
 * @param refinementContext - Where issues are recorded.
 */
function validateTargetEcho(
	effect: {
		readonly tool: "fork_thread" | "send_message_to_thread";
		readonly target: string;
		readonly arguments: { readonly threadId: string };
	},
	refinementContext: z.RefinementCtx,
): void {
	if (effect.target !== effect.arguments.threadId) {
		const label = effect.tool === "fork_thread" ? "fork" : "send";
		addIssue(refinementContext, ["target"], `target must echo ${label} arguments.threadId`);
	}
}

/**
 * Builds the identity and effect schemas of a dynamic approval: who is
 * calling, in which epoch and operation, and exactly what the tool would do,
 * in the canonical form the hash covers and the projected form the browser sees.
 * @param identity - The session's identity schemas.
 * @param context - The validator for the current epoch and, when present, operation ids.
 * @returns The identity schema and both effect schemas.
 */
function createDynamicApprovalEffectSchemas(identity: IdentitySchemas, context: IdentityContext) {
	const {
		ChildEpochSchema,
		ChildIdSchema,
		DynamicToolCallIdSchema,
		OperationIdSchema,
		ThreadIdSchema,
		TurnIdSchema,
	} = identity;
	const DynamicApprovalToolSchema = z.enum(DYNAMIC_APPROVAL_TOOLS);

	const DynamicApprovalIdentitySchema = z
		.object({
			child: ChildIdSchema,
			epoch: ChildEpochSchema,
			threadId: ThreadIdSchema,
			turnId: TurnIdSchema,
			callId: DynamicToolCallIdSchema,
			namespace: z.literal(DYNAMIC_APPROVAL_NAMESPACE),
			tool: DynamicApprovalToolSchema,
			manifestHash: boundedText(256),
			operationId: OperationIdSchema,
		})
		.strict()
		.superRefine((value, refinementContext) => {
			try {
				context.validator.assertCurrentEpoch(value.child, value.epoch);
			} catch (error) {
				addIssue(
					refinementContext,
					["epoch"],
					error instanceof Error ? error.message : "identity epoch is not current",
				);
			}
			try {
				context.operation?.validator.assertCurrentOperationId(value.operationId);
			} catch (error) {
				addIssue(
					refinementContext,
					["operationId"],
					error instanceof Error ? error.message : "identity OperationId is not current",
				);
			}
		});

	const CreateArgumentsSchema = z.object({ prompt: boundedText(16_384) }).strict();
	const ForkArgumentsSchema = z
		.object({
			threadId: ThreadIdSchema,
			beforeTurnId: TurnIdSchema.nullable(),
			prompt: boundedText(16_384).nullable(),
		})
		.strict();
	const SendArgumentsSchema = z
		.object({ threadId: ThreadIdSchema, prompt: boundedText(16_384) })
		.strict();
	const ForkBoundarySchema = z.union([
		z.object({ relation: z.literal("self"), beforeTurnId: TurnIdSchema }).strict(),
		z.object({ relation: z.literal("other"), beforeTurnId: TurnIdSchema.nullable() }).strict(),
	]);

	const DynamicApprovalEffectSchema = z
		.discriminatedUnion("tool", [
			z
				.object({
					tool: z.literal("create_thread"),
					arguments: CreateArgumentsSchema,
					callerAuthority: AuthorityTokenSchema,
					targetAuthority: z.null(),
					contextAuthority: AuthorityTokenSchema,
					effectiveBoundary: z.null(),
					mutationOperationId: OperationIdSchema,
					initialTurnOperationId: OperationIdSchema,
					visualSummary: boundedText(512),
				})
				.strict(),
			z
				.object({
					tool: z.literal("fork_thread"),
					arguments: ForkArgumentsSchema,
					callerAuthority: AuthorityTokenSchema,
					targetAuthority: AuthorityTokenSchema,
					contextAuthority: AuthorityTokenSchema,
					effectiveBoundary: ForkBoundarySchema,
					mutationOperationId: OperationIdSchema,
					initialTurnOperationId: OperationIdSchema.nullable(),
					visualSummary: boundedText(512),
				})
				.strict(),
			z
				.object({
					tool: z.literal("send_message_to_thread"),
					arguments: SendArgumentsSchema,
					callerAuthority: AuthorityTokenSchema,
					targetAuthority: AuthorityTokenSchema,
					contextAuthority: AuthorityTokenSchema,
					effectiveBoundary: z.null(),
					mutationOperationId: OperationIdSchema,
					initialTurnOperationId: z.null(),
					visualSummary: boundedText(512),
				})
				.strict(),
		])
		.superRefine((effect, refinementContext) => {
			validateCreateInitialTurn(effect, refinementContext);
			if (effect.tool === "fork_thread") {
				validateForkInitialTurn(effect, refinementContext);
			}
		});

	const BrowserDynamicApprovalEffectSchema = z
		.discriminatedUnion("tool", [
			z
				.object({
					tool: z.literal("create_thread"),
					arguments: CreateArgumentsSchema,
					target: z.null(),
					effectiveBoundary: z.null(),
					mutationOperationId: OperationIdSchema,
					initialTurnOperationId: OperationIdSchema,
					visualSummary: boundedText(512),
				})
				.strict(),
			z
				.object({
					tool: z.literal("fork_thread"),
					arguments: ForkArgumentsSchema,
					target: ThreadIdSchema,
					effectiveBoundary: ForkBoundarySchema,
					mutationOperationId: OperationIdSchema,
					initialTurnOperationId: OperationIdSchema.nullable(),
					visualSummary: boundedText(512),
				})
				.strict(),
			z
				.object({
					tool: z.literal("send_message_to_thread"),
					arguments: SendArgumentsSchema,
					target: ThreadIdSchema,
					effectiveBoundary: z.null(),
					mutationOperationId: OperationIdSchema,
					initialTurnOperationId: z.null(),
					visualSummary: boundedText(512),
				})
				.strict(),
		])
		.superRefine((effect, refinementContext) => {
			validateCreateInitialTurn(effect, refinementContext);
			if (effect.tool === "create_thread") {
				return;
			}
			validateTargetEcho(effect, refinementContext);
			if (effect.tool === "fork_thread") {
				validateForkInitialTurn(effect, refinementContext);
			}
		});

	return {
		DynamicApprovalIdentitySchema,
		DynamicApprovalEffectSchema,
		BrowserDynamicApprovalEffectSchema,
	};
}

type DynamicApprovalEffectSchemas = ReturnType<typeof createDynamicApprovalEffectSchemas>;

export {
	DYNAMIC_APPROVAL_NAMESPACE,
	DYNAMIC_APPROVAL_TOOLS,
	DYNAMIC_APPROVAL_DECISIONS,
	DYNAMIC_APPROVAL_STATES,
	createDynamicApprovalEffectSchemas,
	type DynamicApprovalEffectSchemas,
};
