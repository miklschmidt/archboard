import { z } from "zod";
import { getChanges, type ChangeFeedResponse } from "../../runtime/engine/canvas-client.js";
import { defineCommand } from "../command-contract/contract.js";
import { HoldReportSchema } from "../command-contract/schemas.js";
import { commonRefusals } from "../command-contract/common.js";

export const ChangesCursorInputSchema = z
	.string()
	.optional()
	.transform((value, context) => {
		const cursor = value === undefined ? 0 : Number(value);
		if (!Number.isFinite(cursor) || cursor < 0) {
			context.addIssue({
				code: "custom",
				message: "--since takes a cursor from a previous `changes` response",
			});
			return z.NEVER;
		}
		return cursor;
	});
export const ChangesInputSchema = z.object({
	since: ChangesCursorInputSchema,
	coalesce: z.boolean().default(false),
	detail: z.boolean().default(false),
	text: z.boolean().default(false),
	tail: z.array(z.string()).default([]),
});
export type ChangesInput = z.infer<typeof ChangesInputSchema>;
export const ChangesJsonResultSchema = z.looseObject({
	success: z.boolean(),
	board: z.string(),
	feedId: z.string().optional(),
	cursor: z.number().int().nonnegative(),
	events: z.array(z.record(z.string(), z.unknown())),
	held: HoldReportSchema.optional(),
});
export type ChangesJsonResult = z.infer<typeof ChangesJsonResultSchema>;
export const ChangesResultSchema = z.union([ChangesJsonResultSchema, z.string()]);
export type ChangesResult = z.infer<typeof ChangesResultSchema>;

function textReport(report: ChangeFeedResponse, coalesce: boolean): string {
	const lines: string[] = [];
	if (report.truncated) lines.push(report.message ?? "The feed no longer reaches back that far.");
	else if (coalesce) {
		const net = report.coalesced;
		if (!net || net.significance === "none")
			lines.push(`Nothing has changed on "${String(report.board)}" since then.`);
		else {
			lines.push(`${String(report.board)}: ${String(net.headline)}`);
			if (typeof net.text === "string") lines.push(net.text);
		}
	} else if (report.events.length === 0)
		lines.push(`Nothing has changed on "${report.board}" since then.`);
	else
		for (const event of report.events) {
			lines.push(
				`[${String(event.cursor)}] ${String(event.at)} — ${String(event.origin)} ${String(event.significance)}: ${String(event.headline)}`,
			);
			if (typeof event.text === "string") lines.push(event.text);
		}
	lines.push(`(cursor ${report.cursor}${report.feedId ? `, feed ${report.feedId}` : ""})`);
	return lines.join("\n");
}

export const changesContract = defineCommand({
	path: ["changes"],
	summary: "Semantic changes on the board since a cursor — what it became, not which pixels moved",
	usage: "changes --board <key> [--since <cursor>] [--coalesce] [--detail] [--text]",
	description: "Reads cursor-based semantic change events or their net coalesced difference.",
	examples: ["archboard changes --board system --since 4"],
	parameters: [
		{
			kind: "option",
			key: "since",
			spellings: ["--since"],
			value: "required",
			description: "Previous response cursor",
		},
		{
			kind: "option",
			key: "coalesce",
			spellings: ["--coalesce"],
			value: "none",
			description: "Return one net difference",
		},
		{
			kind: "option",
			key: "detail",
			spellings: ["--detail"],
			value: "none",
			description: "Include detailed changes",
		},
		{
			kind: "option",
			key: "text",
			spellings: ["--text"],
			value: "none",
			description: "Print a human-readable report",
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
	input: { ingress: ChangesInputSchema },
	result: ChangesResultSchema,
	output: {
		cases: [
			{
				id: "json",
				when: { key: "text", present: false },
				mode: "json",
				held: "object-field-and-stderr-note",
				description: "Structured change feed",
				presentation: ["result", "held-note"],
			},
			{
				id: "text",
				when: { key: "text", present: true },
				mode: "text",
				held: "none",
				description: "Human-readable change feed",
				presentation: ["result"],
			},
		],
		select: (input) => (input.text ? "text" : "json"),
	},
	prerequisites: ["server", "board"],
	effects: ["read"],
	refusals: commonRefusals,
	relationships: [
		{
			method: "GET",
			path: "/api/changes",
			cardinality: "one",
			description: "Read semantic changes",
		},
	],
	async handler(input, context) {
		await context.require("server", "changes");
		const report = await getChanges({
			since: input.since,
			coalesce: input.coalesce,
			detail: input.detail,
		});
		return {
			result: input.text
				? textReport(report, input.coalesce)
				: ChangesJsonResultSchema.parse(report),
		};
	},
});
