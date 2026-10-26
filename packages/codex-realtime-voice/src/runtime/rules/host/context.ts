import { cloneAndFreeze } from "#runtime/rules/host/immutability.ts";
import { z } from "zod";
import { ADDITIONAL_CONTEXT_POLICY } from "#runtime/rules/instructions/context-policy.ts";

const named = z.string().min(1);
const timestamp = z.number().int().nonnegative().finite();
const policy = ADDITIONAL_CONTEXT_POLICY;
const link = z
	.strictObject({
		state: z.enum([
			...policy.threadLink.reasonNullStates,
			...policy.threadLink.reasonRequiredStates,
		]),
		reason: z.enum(policy.threadLink.reasonPrecedence.map((item) => item.reason)).nullable(),
	})
	.superRefine((value, issue) => {
		const nullStates: readonly string[] = policy.threadLink.reasonNullStates;
		if (nullStates.includes(value.state) !== (value.reason === null)) {
			issue.addIssue({ code: "custom", message: "Link classification and reason disagree." });
		}
	});
const operation = z
	.union([
		z.strictObject({ id: z.null(), kind: z.null(), rpc: z.null(), outcome: z.null() }),
		z.strictObject({
			id: named,
			kind: z.enum(policy.operation.producers.map((item) => item.kind)),
			rpc: z.enum(policy.operation.producers.flatMap((item) => item.rpcs)),
			outcome: z.enum(["delivered", "not_delivered", "outcome_unknown"]).nullable(),
		}),
	])
	.superRefine((value, issue) => {
		if (value.id === null) return;
		const allowed: readonly string[] =
			policy.operation.producers.find((item) => item.kind === value.kind)?.rpcs ?? [];
		if (!allowed.includes(value.rpc))
			issue.addIssue({ code: "custom", message: "Operation kind and RPC disagree." });
	});

/** The execution facts a thread reads; any other key is the host's own data, which these never are. */
const WorkbenchExecutionContextSchema = z.object({
	threadLink: link,
	child: z.strictObject({ id: named, epoch: named }),
	workhorse: z.strictObject({ threadId: named.nullable(), turnId: named.nullable() }),
	coordinator: z.strictObject({ threadId: named.nullable(), realtimeSessionId: named.nullable() }),
	/** The host's text, and the window in which it is fresh. */
	brief: z
		.strictObject({ text: z.string(), capturedAtMs: timestamp, freshUntilMs: timestamp })
		.refine((value) => value.freshUntilMs >= value.capturedAtMs),
	operation,
});

/** The keys of the execution facts, which host data never replaces. */
const EXECUTION_CONTEXT_KEYS: readonly string[] = Object.freeze(
	Object.keys(WorkbenchExecutionContextSchema.shape),
);

type ExecutionContext = z.infer<typeof WorkbenchExecutionContextSchema>;

/**
 * Capture all host data and validate execution facts independently of host encoding.
 * @param input The context supplied by the host.
 * @returns An immutable independent snapshot with validated execution facts.
 */
function captureExecutionContext<Context extends ExecutionContext>(input: Context): Context {
	const captured = cloneAndFreeze(input);
	WorkbenchExecutionContextSchema.parse(captured);
	return captured;
}

export { EXECUTION_CONTEXT_KEYS, WorkbenchExecutionContextSchema, captureExecutionContext };
