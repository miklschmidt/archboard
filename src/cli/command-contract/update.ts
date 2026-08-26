import { z } from "zod";
import { updateElementStrict } from "../../runtime/engine/canvas-client.js";
import { defineCommand, type CommandContext } from "./contract.js";
import { BoardFingerprintSchema, HoldReportSchema, ServerElementSchema } from "./schemas.js";
import { commonRefusals, tail, WRITE_ANSWER } from "./lib/common.js";

export const UpdateInputSchema = z.object({
	id: z.preprocess(
		(value) => value ?? "",
		z.string().min(1, { error: 'Usage: update <id> --set \'{"backgroundColor": "#ffc9c9"}\'' }),
	),
	input: z.string().optional(),
	tail,
	set: z.string().optional(),
	document: z.boolean().default(false),
});
export type UpdateInput = z.infer<typeof UpdateInputSchema>;

const updatesSchema = z.record(z.string(), z.unknown());
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
				context.addIssue({
					code: "custom",
					message:
						source === "inline"
							? `Invalid JSON in --set: ${(error as Error).message}`
							: `Invalid JSON updates: ${(error as Error).message}`,
				});
				return z.NEVER;
			}
			if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
				context.addIssue({ code: "custom", message: "Updates must be a JSON object" });
				return z.NEVER;
			}
			return parsed as Record<string, unknown>;
		})
		.pipe(updatesSchema);
export const UpdateResultSchema = z.object({
	success: z.literal(true),
	element: ServerElementSchema,
	elements: z.array(ServerElementSchema),
	fingerprint: BoardFingerprintSchema,
	document: z.array(ServerElementSchema).optional(),
	held: HoldReportSchema.optional(),
});
export type UpdateResult = z.infer<typeof UpdateResultSchema>;

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

export const updateContract = defineCommand({
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

export { WRITE_ANSWER } from "./lib/common.js";
