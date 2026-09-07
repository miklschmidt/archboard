import { z } from "zod";
import { updateElementStrict } from "@/runtime/engine/canvas-client";
import { defineCommand } from "@/cli/command-contract/contract";
import type { CommandContext } from "@/cli/command-contract/contract";
import {
	BoardFingerprintSchema,
	HoldReportSchema,
	ServerElementSchema,
} from "@/cli/command-contract/schemas";
import { commonRefusals, tail, WRITE_ANSWER } from "@/cli/command-contract/lib/common";

const UpdateInputSchema = z.object({
	id: z.preprocess(
		(value) => value ?? "",
		z.string().min(1, { error: 'Usage: update <id> --set \'{"backgroundColor": "#ffc9c9"}\'' }),
	),
	input: z.string().optional(),
	tail,
	set: z.string().optional(),
	document: z.boolean().default(false),
});
type UpdateInput = z.infer<typeof UpdateInputSchema>;

const updatesSchema = z.record(z.string(), z.unknown());

/**
 * Says what is wrong with JSON updates that would not parse, naming the place
 * they came from so the person knows which input to correct.
 * @param source - Whether the JSON came from `--set` or from a file or stdin.
 * @param error - What JSON.parse threw.
 * @returns The message to report.
 */
function invalidUpdatesMessage(source: "inline" | "stream", error: unknown): string {
	const reason = error instanceof Error ? error.message : String(error);
	return source === "inline"
		? `Invalid JSON in --set: ${reason}`
		: `Invalid JSON updates: ${reason}`;
}

/**
 * The schema for a JSON object of element updates, reading its refusals in the
 * words of the input the updates arrived through.
 * @param source - Whether the JSON came from `--set` or from a file or stdin.
 * @returns The schema, which yields the updates as a record.
 */
const jsonUpdatesSchema = (source: "inline" | "stream") =>
	z
		.string()
		.transform((raw, context) => {
			if (source === "stream" && !raw.trim()) {
				context.addIssue({
					code: "custom",
					message: "No updates provided (pass a file argument or pipe JSON to stdin)",
				});
				return z.NEVER;
			}
			let parsed: unknown;
			try {
				parsed = JSON.parse(raw);
			} catch (error) {
				context.addIssue({ code: "custom", message: invalidUpdatesMessage(source, error) });
				return z.NEVER;
			}
			const updates = updatesSchema.safeParse(parsed);
			if (!updates.success || Array.isArray(parsed)) {
				context.addIssue({ code: "custom", message: "Updates must be a JSON object" });
				return z.NEVER;
			}
			return updates.data;
		})
		.pipe(updatesSchema);
const UpdateResultSchema = z.object({
	success: z.literal(true),
	element: ServerElementSchema,
	elements: z.array(ServerElementSchema),
	fingerprint: BoardFingerprintSchema,
	document: z.array(ServerElementSchema).optional(),
	held: HoldReportSchema.optional(),
});
type UpdateResult = z.infer<typeof UpdateResultSchema>;

/**
 * Reads the updates from wherever this invocation put them: inline after
 * `--set`, in a named file, or on standard input.
 * @param input - The parsed command input.
 * @param context - The command context, which owns the reads and the validation.
 * @returns The updates as a record of element fields.
 */
async function updateInput(input: UpdateInput, context: CommandContext) {
	if (input.set !== undefined) {
		return context.parse(jsonUpdatesSchema("inline"), input.set);
	}
	const raw =
		input.input !== undefined && input.input !== "-"
			? context.readTextFile(input.input)
			: await context.readStdin();
	return context.parse(jsonUpdatesSchema("stream"), raw);
}

const updateContract = defineCommand({
	path: ["update"],
	summary: "Update one element",
	usage: [
		'update <id> --set \'{"backgroundColor":"#ffc9c9"}\' [--document]',
		"",
		WRITE_ANSWER,
	].join("\n"),
	description: "Updates one element in one version-checked board write.",
	examples: ['archboard update box --set \'{"x":120}\' --board payments --doing "moving box"'],
	parameters: [
		{ kind: "positional", key: "id", name: "id", description: "Element id" },
		{
			kind: "positional",
			key: "input",
			name: "updates.json|-",
			route: "stdin-or-file",
			description: "JSON update source",
		},
		{
			kind: "positional",
			key: "tail",
			name: "ignored",
			repeatable: true,
			route: "pass-through",
			description: "Legacy ignored positional content",
		},
		{
			kind: "option",
			key: "set",
			spellings: ["--set"],
			value: "required",
			description: "Inline JSON update",
		},
		{
			kind: "option",
			key: "document",
			spellings: ["--document"],
			value: "none",
			description: "Include the whole board",
		},
	],
	input: {
		ingress: UpdateInputSchema,
		stages: [
			{
				name: "updates",
				when: "before-server",
				description: "JSON object from --set, file, or stdin",
				schema: updatesSchema,
			},
		],
	},
	result: UpdateResultSchema,
	output: {
		cases: [
			{
				id: "json",
				when: {},
				mode: "json",
				held: "object-field-and-stderr-note",
				description: "Versioned write result",
			},
		],
		/**
		 * An update always answers with the versioned write receipt.
		 * @returns The only output case's id.
		 */
		select: () => "json",
	},
	prerequisites: ["server", "board", "doing"],
	effects: ["local-read", "write"],
	refusals: [
		...commonRefusals,
		{
			code: "DOING_REQUIRED",
			exit: 1,
			stream: "stderr",
			description: "A board write did not declare what it was doing.",
		},
		{
			code: "BOARD_HELD",
			exit: 5,
			stream: "stderr",
			description: "Another writer currently holds the board lease.",
		},
		{
			code: "BOARD_CONFLICT",
			exit: 5,
			stream: "stderr",
			description: "The note changed on disk outside Archboard.",
		},
		{
			code: "BOARD_VERSION_CONFLICT",
			exit: 5,
			stream: "stderr",
			description: "The board advanced past expect-version.",
		},
		{
			code: "CLAIM_REVOKED",
			exit: 5,
			stream: "stderr",
			description: "The person took back the claim.",
		},
	],
	relationships: [
		{
			method: "PUT",
			path: "/api/elements/:id",
			cardinality: "one",
			description: "Exactly one board write",
		},
	],
	/**
	 * Applies the updates to one element in a single version-checked write, and
	 * publishes the element, the board's new fingerprint, and the whole board
	 * when `--document` asked for it.
	 * @param input - The parsed command input.
	 * @param context - The command context.
	 * @returns The write receipt as the command's result.
	 */
	async handler(input, context) {
		const updates = await updateInput(input, context);
		await context.require("server", "Updating an element");
		const response = await updateElementStrict(
			{ ...updates, id: input.id },
			input.document ? { document: true } : {},
		);
		return {
			result: UpdateResultSchema.parse({
				success: true as const,
				element: response.element,
				elements: response.elements ?? [],
				fingerprint: response.fingerprint,
				...(response.document ? { document: response.document } : {}),
			}),
		};
	},
});

export {
	UpdateInputSchema,
	type UpdateInput,
	UpdateResultSchema,
	type UpdateResult,
	updateContract,
};
export { WRITE_ANSWER } from "@/cli/command-contract/lib/common";
