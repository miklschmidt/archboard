import { z } from "zod";
import { claimBoard, releaseBoardClaim } from "@/runtime/engine/canvas-client";
import { defineCommand } from "@/cli/command-contract/contract";
import { claimRefusals, commonRefusals } from "@/cli/command-contract/common";

const ClaimReasonInputSchema = z
	.string({
		error:
			'claim needs --reason: it is what the pane shows the person whose board you have taken. Without it the wall has stopped working for no reason they can see. Say what you are taking it for, in their words: --reason "redrawing the payment path". That is the campaign; --doing on each write is the step.',
	})
	.trim()
	.min(
		1,
		'claim needs --reason: it is what the pane shows the person whose board you have taken. Without it the wall has stopped working for no reason they can see. Say what you are taking it for, in their words: --reason "redrawing the payment path". That is the campaign; --doing on each write is the step.',
	);
const ClaimDurationInputSchema = z
	.string()
	.optional()
	.transform((said, context) => {
		if (said === undefined) {
			return undefined;
		}
		const match = /^(\d+(?:\.\d+)?)\s*(s|m|h)$/iu.exec(said.trim());
		if (!match) {
			context.addIssue({
				code: "custom",
				message: `--for takes a duration with a unit: 90s, 10m, 1h. "${said}" has none, and a bare number is as easily minutes as seconds.`,
			});
			return z.NEVER;
		}
		const amount = Number(match[1]);
		const unit = match[2]!.toLowerCase();
		return amount * (unit === "h" ? 3_600_000 : unit === "m" ? 60_000 : 1000);
	});
const tail = z.array(z.string()).default([]);

const ClaimInputSchema = z.object({
	reason: ClaimReasonInputSchema,
	for: ClaimDurationInputSchema,
	tail,
});
type ClaimInput = z.infer<typeof ClaimInputSchema>;
const LockHolderSchema = z.looseObject({
	id: z.string(),
	kind: z.string(),
	since: z.string(),
	until: z.string(),
	process: z.string(),
	reason: z.string().optional(),
});
const BoardClaimSchema = z.looseObject({
	board: z.string(),
	holder: LockHolderSchema,
	expires: z.string(),
});
const ClaimResultSchema = z.looseObject({
	success: z.boolean(),
	board: z.string(),
	created: z.boolean(),
	claim: BoardClaimSchema,
});
type ClaimResult = z.infer<typeof ClaimResultSchema>;
const claimContract = defineCommand({
	path: ["claim"],
	shared: ["url", "board"],
	summary: "Take a board for a stretch of work, so twenty writes are one uninterrupted act",
	description:
		"Takes or extends a board lease for work you know in advance is substantial. An ordinary " +
		"write already takes the board for as long as it takes; a claim keeps it between the writes, " +
		"so nobody else writes into the gaps. Every write to the board while the claim stands goes " +
		"under it, and a write does not extend it. A person can release the claim with one control: " +
		"your next act is then refused once, nothing is rolled back, and you stop.",
	examples: [
		'archboard claim --board payments --reason "redrawing the payment path"',
		'archboard claim --board payments --reason "redrawing the payment path" --for 1h',
	],
	parameters: [
		{
			kind: "option",
			key: "reason",
			spellings: ["--reason"],
			value: "required",
			placeholder: "reason",
			required: true,
			description:
				"What the board is taken for, shown on every pane holding it: the campaign, where " +
				"--doing on each write is the step",
		},
		{
			kind: "option",
			key: "for",
			spellings: ["--for"],
			value: "required",
			placeholder: "duration",
			default: "10m",
			description: "How long the claim lasts, with a unit: 90s, 10m, 1h. Claim again to extend",
		},
		{
			kind: "positional",
			key: "tail",
			name: "ignored",
			repeatable: true,
			route: "pass-through",
			hidden: true,
			description: "Legacy ignored positional content",
		},
	],
	input: { ingress: ClaimInputSchema },
	result: ClaimResultSchema,
	output: {
		cases: [
			{
				id: "json",
				when: {},
				mode: "json",
				description: "Claim state",
				presentation: ["diagnostics", "result"],
			},
		],
		/**
		 * Claim has one output shape.
		 * @returns The JSON case id.
		 */
		select: () => "json",
	},
	prerequisites: ["server", "board"],
	effects: ["server-state-write"],
	refusals: claimRefusals,
	relationships: [
		{
			method: "POST",
			path: "/api/boards/claim",
			cardinality: "one",
			description: "Take or extend the claim",
		},
	],
	/**
	 * Takes or extends the caller's lease on the requested board and explains, in the person's
	 * words, what the claim means for the panes showing it.
	 * @param input - The parsed claim input.
	 * @param context - The command execution context.
	 * @returns The claim state plus a diagnostic describing the lease.
	 */
	async handler(input, context) {
		await context.require("server", "claim");
		const result = await claimBoard({
			reason: input.reason,
			...(input.for !== undefined ? { forMs: input.for } : {}),
		});
		const until = new Date(result.claim.expires).toTimeString().slice(0, 5);
		const diagnostic = `${
			result.created
				? `"${result.board}" is yours until ${until}, or until you release it.`
				: `Your claim on "${result.board}" now runs to ${until}.`
		} Every write you make to it goes under the claim, and nobody else writes to it meanwhile. Panes showing it are read-only to people until you release it; a person can release your claim with one explicit control, you will be told, and what you have already written stays. Leave the board sensible after each write. Release it with \`archboard release --board ${result.board}\`.`;
		return { result: ClaimResultSchema.parse(result), diagnostics: [diagnostic] };
	},
});

const ReleaseInputSchema = z.object({ tail });
type ReleaseInput = z.infer<typeof ReleaseInputSchema>;
const ReleaseResultSchema = z.looseObject({
	success: z.boolean(),
	board: z.string(),
	released: z.boolean(),
	claim: BoardClaimSchema.nullable(),
});
type ReleaseResult = z.infer<typeof ReleaseResultSchema>;
const releaseContract = defineCommand({
	path: ["release"],
	shared: ["url", "board"],
	summary: "Give back a board you claimed",
	description:
		"Ends this caller's claim on the board. The board goes back to being taken one write at a " +
		"time and everything written stays. Releasing a claim that has run out, or that somebody took " +
		"back, is not an error: it answers released: false.",
	examples: ["archboard release --board payments"],
	parameters: [
		{
			kind: "positional",
			key: "tail",
			name: "ignored",
			repeatable: true,
			route: "pass-through",
			hidden: true,
			description: "Legacy ignored positional content",
		},
	],
	input: { ingress: ReleaseInputSchema },
	result: ReleaseResultSchema,
	output: {
		cases: [
			{
				id: "json",
				when: {},
				mode: "json",
				description: "Release state",
				presentation: ["diagnostics", "result"],
			},
		],
		/**
		 * Release has one output shape.
		 * @returns The JSON case id.
		 */
		select: () => "json",
	},
	prerequisites: ["server", "board"],
	effects: ["server-state-write"],
	refusals: commonRefusals,
	relationships: [
		{
			method: "POST",
			path: "/api/boards/release",
			cardinality: "one",
			description: "Release the claim",
		},
	],
	/**
	 * Ends this caller's claim on the requested board, or reports that none was held here.
	 * @param _input - The parsed release input (unused: the board comes from the request context).
	 * @param context - The command execution context.
	 * @returns The release state plus a diagnostic saying what happened.
	 */
	async handler(_input, context) {
		await context.require("server", "release");
		const result = await releaseBoardClaim();
		const diagnostic = result.released
			? `"${result.board}" is free. It goes back to being taken one write at a time.`
			: `Nothing to release: "${result.board}" was not claimed here. A claim that ran out, or that somebody took back, has already ended.`;
		return { result: ReleaseResultSchema.parse(result), diagnostics: [diagnostic] };
	},
});

export {
	ClaimReasonInputSchema,
	ClaimDurationInputSchema,
	ClaimInputSchema,
	type ClaimInput,
	ClaimResultSchema,
	type ClaimResult,
	claimContract,
	ReleaseInputSchema,
	type ReleaseInput,
	ReleaseResultSchema,
	type ReleaseResult,
	releaseContract,
};
