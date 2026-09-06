import { z } from "zod";
import { claimBoard, releaseBoardClaim } from "@/runtime/engine/canvas-client";
import { defineCommand } from "@/cli/command-contract/contract";
import { HoldReportSchema } from "@/cli/command-contract/schemas";
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
	held: HoldReportSchema.optional(),
});
type ClaimResult = z.infer<typeof ClaimResultSchema>;
const claimContract = defineCommand({
	path: ["claim"],
	summary: "Take a board for a stretch of work, so twenty writes are one uninterrupted act",
	usage: "claim --board <key> --reason <reason> [--for 10m]",
	description: "Takes or extends a board lease for substantial work.",
	examples: ['archboard claim --board payments --reason "redrawing payment path"'],
	parameters: [
		{
			kind: "option",
			key: "reason",
			spellings: ["--reason"],
			value: "required",
			description: "Campaign shown on the pane",
		},
		{
			kind: "option",
			key: "for",
			spellings: ["--for"],
			value: "required",
			description: "Lease duration",
		},
		{
			kind: "positional",
			key: "tail",
			name: "ignored",
			repeatable: true,
			route: "pass-through",
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
				held: "object-field-and-stderr-note",
				description: "Claim state",
				presentation: ["diagnostics", "result", "held-note"],
			},
		],
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
	held: HoldReportSchema.optional(),
});
type ReleaseResult = z.infer<typeof ReleaseResultSchema>;
const releaseContract = defineCommand({
	path: ["release"],
	summary: "Give back a board you claimed",
	usage: "release --board <key>",
	description: "Ends this caller's board claim if one remains.",
	examples: ["archboard release --board payments"],
	parameters: [
		{
			kind: "positional",
			key: "tail",
			name: "ignored",
			repeatable: true,
			route: "pass-through",
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
				held: "object-field-and-stderr-note",
				description: "Release state",
				presentation: ["diagnostics", "result", "held-note"],
			},
		],
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
