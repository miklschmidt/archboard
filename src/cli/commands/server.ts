import { z } from "zod";
import { canvasPort, ensureCanvasRunning, stopCanvas } from "../../runtime/engine/spawn.js";
import { readPidFile } from "../../runtime/engine/pidfile.js";
import { defineCommand } from "../command-contract/contract.js";
import { HoldReportSchema } from "../command-contract/schemas.js";

const IgnoredTailSchema = z.array(z.string()).default([]);

export const StartInputSchema = z.object({ tail: IgnoredTailSchema });
export type StartInput = z.infer<typeof StartInputSchema>;

export const StartResultSchema = z.object({
	running: z.literal(true),
	url: z.string(),
	spawned: z.boolean(),
	pid: z.number().int().positive().optional(),
	held: HoldReportSchema.optional(),
});
export type StartResult = z.infer<typeof StartResultSchema>;

export const startContract = defineCommand({
	path: ["start"],
	summary: "Start the canvas server (detached)",
	usage: "start",
	description: "Explicitly starts the local canvas, overriding automatic-start opt-outs.",
	examples: ["archboard start"],
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
	input: { ingress: StartInputSchema },
	result: StartResultSchema,
	output: {
		cases: [
			{
				id: "json",
				when: {},
				mode: "json",
				held: "object-field-and-stderr-note",
				description: "Server startup state",
				presentation: ["diagnostics", "result", "held-note"],
			},
		],
		select: () => "json",
	},
	prerequisites: [],
	effects: ["local-write"],
	refusals: [
		{
			code: "CANVAS_UNREACHABLE",
			exit: 3,
			stream: "stderr",
			description: "The explicitly started canvas did not become healthy.",
		},
	],
	relationships: [
		{
			method: "GET",
			path: "/health",
			cardinality: "conditional",
			description: "Identity probe before and after a possible local spawn",
		},
	],
	async handler() {
		const result = await ensureCanvasRunning({ force: true });
		return {
			result: {
				running: true as const,
				url: result.url,
				spawned: result.spawned,
				pid: readPidFile(canvasPort()) ?? undefined,
			},
			...(result.spawned
				? {}
				: { diagnostics: [`Canvas server already running at ${result.url}`] }),
		};
	},
});

export const StopInputSchema = z.object({ tail: IgnoredTailSchema });
export type StopInput = z.infer<typeof StopInputSchema>;

export const StopResultSchema = z.object({
	stopped: z.boolean(),
	pid: z.number().int().positive().optional(),
	message: z.string(),
	held: HoldReportSchema.optional(),
});
export type StopResult = z.infer<typeof StopResultSchema>;

export const stopContract = defineCommand({
	path: ["stop"],
	summary: "Stop the canvas server",
	usage: "stop",
	description: "Stops only a live process that identifies itself as this canvas service.",
	examples: ["archboard stop"],
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
	input: { ingress: StopInputSchema },
	result: StopResultSchema,
	output: {
		cases: [
			{
				id: "json",
				when: {},
				mode: "json",
				held: "object-field-and-stderr-note",
				description: "Identity-safe stop result",
				presentation: ["result", "held-note"],
			},
		],
		select: () => "json",
	},
	prerequisites: [],
	effects: ["local-write"],
	refusals: [],
	relationships: [
		{
			method: "GET",
			path: "/health",
			cardinality: "one",
			description: "Identity check before signaling a local process",
		},
	],
	async handler() {
		return { result: await stopCanvas() };
	},
});
