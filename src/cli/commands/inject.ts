import { z } from "zod";
import { getInjection, postInjectionTest } from "../../runtime/engine/canvas-client.js";
import { CliUsageError, defineCommand } from "../command-contract/contract.js";
import { HoldReportSchema } from "../command-contract/schemas.js";

const tail = z.array(z.string()).default([]);

const InjectionSocketSchema = z.looseObject({
	path: z.string(),
	exists: z.boolean(),
	isSocket: z.boolean(),
	ownedByUs: z.boolean(),
	mode: z.string().optional(),
	problem: z.string().optional(),
});
const InjectionTargetSchema = z.looseObject({
	threadId: z.string().nullable(),
	reason: z.enum(["pinned", "none"]),
	explanation: z.string(),
	activeTurnId: z.string().nullable().optional(),
});
const LastInjectionSchema = z.looseObject({
	channel: z.enum(["quiet", "loud"]),
	threadId: z.string(),
	at: z.string(),
	text: z.string(),
});

export const InjectNamespaceInputSchema = z.object({ action: z.string().optional(), tail });
export type InjectNamespaceInput = z.infer<typeof InjectNamespaceInputSchema>;
export const InjectNamespaceResultSchema = z.never();
export type InjectNamespaceResult = z.infer<typeof InjectNamespaceResultSchema>;
export const injectContract = defineCommand({
	path: ["inject"],
	summary:
		"Whether the canvas can push board changes into a live Codex thread, and a probe to prove it",
	usage: 'inject status | inject test [--note "..."] [--loud]',
	description: "Routes injection status and test commands.",
	examples: ["archboard inject status"],
	parameters: [
		{ kind: "positional", key: "action", name: "subcommand", description: "Injection subcommand" },
		{
			kind: "positional",
			key: "tail",
			name: "arguments",
			repeatable: true,
			route: "staged-tokens",
			description: "Subcommand arguments",
		},
	],
	input: { ingress: InjectNamespaceInputSchema },
	result: InjectNamespaceResultSchema,
	output: {
		cases: [{ id: "json", when: {}, mode: "json", held: "none", description: "Namespace refusal" }],
		select: () => "json",
	},
	prerequisites: [],
	effects: [],
	refusals: [],
	relationships: [],
	async handler(input) {
		throw new CliUsageError(
			`unknown inject subcommand "${input.action ?? ""}" — try \`inject status\` or \`inject test\``,
		);
	},
});

export const InjectStatusInputSchema = z.object({ tail });
export type InjectStatusInput = z.infer<typeof InjectStatusInputSchema>;
export const InjectStatusResultSchema = z.looseObject({
	enabled: z.boolean(),
	armed: z.boolean(),
	loud: z.boolean(),
	refusal: z.string().nullable(),
	host: z.string().nullable(),
	socket: InjectionSocketSchema,
	connected: z.boolean(),
	lastError: z.string().nullable(),
	target: InjectionTargetSchema,
	threadsSeen: z.number().int().nonnegative(),
	pending: z.number().int().nonnegative(),
	debounceMs: z.number().int().nonnegative(),
	minIntervalMs: z.number().int().nonnegative(),
	injected: z.looseObject({
		quiet: z.number().int().nonnegative(),
		loud: z.number().int().nonnegative(),
		failed: z.number().int().nonnegative(),
	}),
	lastInjectionAt: z.string().nullable(),
	lastInjection: LastInjectionSchema.nullable(),
	held: HoldReportSchema.optional(),
});
export type InjectStatusResult = z.infer<typeof InjectStatusResultSchema>;
export const injectStatusContract = defineCommand({
	path: ["inject", "status"],
	summary: "Report injection capability and target",
	usage: "inject status",
	description: "Reports the server-start injection decision and target.",
	examples: ["archboard inject status"],
	parameters: [
		{
			kind: "positional",
			key: "tail",
			name: "ignored",
			repeatable: true,
			route: "pass-through",
			description: "Legacy ignored trailing content",
		},
	],
	input: { ingress: InjectStatusInputSchema },
	result: InjectStatusResultSchema,
	output: {
		cases: [
			{
				id: "json",
				when: {},
				mode: "json",
				held: "object-field-and-stderr-note",
				description: "Injection status",
				presentation: ["result", "held-note"],
			},
		],
		select: () => "json",
	},
	prerequisites: ["server"],
	effects: ["read"],
	refusals: [
		{
			code: "CANVAS_UNREACHABLE",
			exit: 3,
			stream: "stderr",
			description: "The canvas could not be reached.",
		},
	],
	relationships: [
		{
			method: "GET",
			path: "/api/injection",
			cardinality: "one",
			description: "Read injection status",
		},
	],
	async handler(_input, context) {
		await context.require("server", "inject status");
		const { success: _success, ...body } = await getInjection();
		return { result: InjectStatusResultSchema.parse(body) };
	},
});

export const InjectTestInputSchema = z.object({
	note: z.string().optional(),
	loud: z.boolean().default(false),
	quiet: z.boolean().default(false),
	words: tail,
});
export type InjectTestInput = z.infer<typeof InjectTestInputSchema>;
export const InjectTestStageSchema = z
	.object({
		note: z.string().optional(),
		loud: z.boolean(),
		quiet: z.boolean(),
		words: z.array(z.string()),
	})
	.transform((input, context) => {
		if (input.loud && input.quiet) {
			context.addIssue({ code: "custom", message: "pass --loud or --quiet, not both" });
			return z.NEVER;
		}
		const note = (input.note ?? input.words.join(" ")) || undefined;
		return { note, loud: input.loud ? true : input.quiet ? false : undefined };
	});
export type InjectTestStage = z.infer<typeof InjectTestStageSchema>;
export const InjectTestResultSchema = z.looseObject({
	channel: z.enum(["quiet", "loud"]),
	threadId: z.string(),
	text: z.string(),
	held: HoldReportSchema.optional(),
});
export type InjectTestResult = z.infer<typeof InjectTestResultSchema>;
export const injectTestContract = defineCommand({
	path: ["inject", "test"],
	summary: "Probe the configured Codex injection route",
	usage: 'inject test [--note "..."] [--loud]',
	description: "Sends one explicit injection probe, quietly unless loud is selected.",
	examples: ['archboard inject test --note "wiring check"'],
	parameters: [
		{
			kind: "option",
			key: "note",
			spellings: ["--note"],
			value: "required",
			description: "Probe text",
		},
		{
			kind: "option",
			key: "loud",
			spellings: ["--loud"],
			value: "none",
			description: "Steer the running turn",
		},
		{
			kind: "option",
			key: "quiet",
			spellings: ["--quiet"],
			value: "none",
			description: "Append without steering",
		},
		{
			kind: "positional",
			key: "words",
			name: "note",
			repeatable: true,
			description: "Unquoted probe text",
		},
	],
	input: {
		ingress: InjectTestInputSchema,
		stages: [
			{
				name: "probe-request",
				when: "before-server",
				description: "Exclusive injection channel and composed note",
				rules: ["Reject loud and quiet together", "Prefer --note over positional words"],
				schema: InjectTestStageSchema,
			},
		],
	},
	result: InjectTestResultSchema,
	output: {
		cases: [
			{
				id: "json",
				when: {},
				mode: "json",
				held: "object-field-and-stderr-note",
				description: "Injection probe result",
				presentation: ["result", "held-note"],
			},
		],
		select: () => "json",
	},
	prerequisites: ["server"],
	effects: ["server-state-write"],
	refusals: [
		{
			code: "CANVAS_UNREACHABLE",
			exit: 3,
			stream: "stderr",
			description: "The canvas could not be reached.",
		},
	],
	relationships: [
		{
			method: "POST",
			path: "/api/injection/test",
			cardinality: "one",
			description: "Send the injection probe",
		},
	],
	async handler(input, context) {
		const request = context.parse(InjectTestStageSchema, input);
		await context.require("server", "inject test");
		const { success: _success, ...body } = await postInjectionTest({
			...(request.note ? { note: request.note } : {}),
			...(request.loud !== undefined ? { loud: request.loud } : {}),
		});
		return { result: InjectTestResultSchema.parse(body) };
	},
});
