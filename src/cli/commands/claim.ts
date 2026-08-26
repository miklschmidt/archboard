import { z } from "zod";
import { claimBoard, releaseBoardClaim } from "../../runtime/engine/canvas-client.js";
import { defineCommand } from "../command-contract/contract.js";
import { HoldReportSchema } from "../command-contract/schemas.js";
import { claimRefusals, commonRefusals } from "../command-contract/common.js";

export const ClaimReasonInputSchema = z
	.string({
		error:
			'claim needs --reason: it is what the pane shows the person whose board you have taken. Without it the wall has stopped working for no reason they can see. Say what you are taking it for, in their words: --reason "redrawing the payment path". That is the campaign; --doing on each write is the step.',
	})
	.trim()
	.min(
		1,
		'claim needs --reason: it is what the pane shows the person whose board you have taken. Without it the wall has stopped working for no reason they can see. Say what you are taking it for, in their words: --reason "redrawing the payment path". That is the campaign; --doing on each write is the step.',
	);
export const ClaimDurationInputSchema = z
	.string()
	.optional()
	.transform((said, context) => {
		if (said === undefined) return undefined;
		const match = /^(\d+(?:\.\d+)?)\s*(s|m|h)$/i.exec(said.trim());
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

export const ClaimInputSchema = z.object({
	reason: ClaimReasonInputSchema,
	for: ClaimDurationInputSchema,
	tail,
});
export type ClaimInput = z.infer<typeof ClaimInputSchema>;
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
export const ClaimResultSchema = z.looseObject({
	success: z.boolean(),
	board: z.string(),
	created: z.boolean(),
	claim: BoardClaimSchema,
	held: HoldReportSchema.optional(),
});
export type ClaimResult = z.infer<typeof ClaimResultSchema>;
export const claimContract = defineCommand({
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
		const diagnostic =
			(result.created
				? `"${result.board}" is yours until ${until}, or until you release it.`
				: `Your claim on "${result.board}" now runs to ${until}.`) +
			` Every write you make to it goes under the claim, and nobody else writes to it meanwhile. The person at the canvas can take it back at any moment — you will be told, and what you have already written stays. Leave the board sensible after each write, or work on a variant and swap. Release it with \`archboard release --board ${result.board}\`.`;
		return { result: ClaimResultSchema.parse(result), diagnostics: [diagnostic] };
	},
});

export const ReleaseInputSchema = z.object({ tail });
export type ReleaseInput = z.infer<typeof ReleaseInputSchema>;
export const ReleaseResultSchema = z.looseObject({
	success: z.boolean(),
	board: z.string(),
	released: z.boolean(),
	claim: BoardClaimSchema.nullable(),
	held: HoldReportSchema.optional(),
});
export type ReleaseResult = z.infer<typeof ReleaseResultSchema>;
export const releaseContract = defineCommand({
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
