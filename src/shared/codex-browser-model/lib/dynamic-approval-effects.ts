import { z } from "zod";

import { boundedText, type IdentityContext, type IdentitySchemas } from "./scalars.js";

export const DYNAMIC_APPROVAL_NAMESPACE = "archboard_app" as const;
export const DYNAMIC_APPROVAL_TOOLS = [
	"create_thread",
	"fork_thread",
	"send_message_to_thread",
] as const;
export const DYNAMIC_APPROVAL_DECISIONS = ["approve", "decline"] as const;
export const DYNAMIC_APPROVAL_STATES = [
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

function addIssue(context: z.RefinementCtx, path: string[], message: string): void {
	context.addIssue({ code: "custom", path, message });
}

export function createDynamicApprovalEffectSchemas(
	identity: IdentitySchemas,
	context: IdentityContext,
) {
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
			if (
				effect.tool === "create_thread" &&
				effect.initialTurnOperationId === effect.mutationOperationId
			)
				addIssue(
					refinementContext,
					["initialTurnOperationId"],
					"create initial turn needs its own OperationId",
				);
			if (effect.tool !== "fork_thread") return;
			if (effect.arguments.prompt === null && effect.initialTurnOperationId !== null)
				addIssue(
					refinementContext,
					["initialTurnOperationId"],
					"unprompted fork cannot start a turn",
				);
			if (effect.arguments.prompt !== null && effect.initialTurnOperationId === null)
				addIssue(
					refinementContext,
					["initialTurnOperationId"],
					"prompted fork requires an initial turn",
				);
			if (
				effect.initialTurnOperationId !== null &&
				effect.initialTurnOperationId === effect.mutationOperationId
			)
				addIssue(
					refinementContext,
					["initialTurnOperationId"],
					"fork initial turn needs its own OperationId",
				);
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
			if (
				effect.tool === "create_thread" &&
				effect.initialTurnOperationId === effect.mutationOperationId
			)
				addIssue(
					refinementContext,
					["initialTurnOperationId"],
					"create initial turn needs its own OperationId",
				);
			if (effect.tool === "fork_thread") {
				if (effect.target !== effect.arguments.threadId)
					addIssue(refinementContext, ["target"], "target must echo fork arguments.threadId");
				if (effect.arguments.prompt === null && effect.initialTurnOperationId !== null)
					addIssue(
						refinementContext,
						["initialTurnOperationId"],
						"unprompted fork cannot start a turn",
					);
				if (effect.arguments.prompt !== null && effect.initialTurnOperationId === null)
					addIssue(
						refinementContext,
						["initialTurnOperationId"],
						"prompted fork requires an initial turn",
					);
				if (
					effect.initialTurnOperationId !== null &&
					effect.initialTurnOperationId === effect.mutationOperationId
				)
					addIssue(
						refinementContext,
						["initialTurnOperationId"],
						"fork initial turn needs its own OperationId",
					);
			}
			if (effect.tool === "send_message_to_thread" && effect.target !== effect.arguments.threadId)
				addIssue(refinementContext, ["target"], "target must echo send arguments.threadId");
		});

	return {
		DynamicApprovalIdentitySchema,
		DynamicApprovalEffectSchema,
		BrowserDynamicApprovalEffectSchema,
	};
}

export type DynamicApprovalEffectSchemas = ReturnType<typeof createDynamicApprovalEffectSchemas>;
