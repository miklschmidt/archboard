import { z } from "zod";
import { serverPort, ensureServerRunning, stopServer } from "@/runtime/engine/spawn";
import { readPidFile } from "@/runtime/engine/pidfile";
import { defineCommand } from "@/cli/command-contract/contract";

const IgnoredTailSchema = z.array(z.string()).default([]);

const StartInputSchema = z.object({ tail: IgnoredTailSchema });
type StartInput = z.infer<typeof StartInputSchema>;

const StartResultSchema = z.object({
	running: z.literal(true),
	url: z.string(),
	spawned: z.boolean(),
	pid: z.number().int().positive().optional(),
});
type StartResult = z.infer<typeof StartResultSchema>;

const startContract = defineCommand({
	path: ["start"],
	shared: ["url"],
	summary: "Start the Archboard server (detached)",
	description: "Explicitly starts the local Archboard server, overriding automatic-start opt-outs.",
	examples: ["archboard start"],
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
	input: { ingress: StartInputSchema },
	result: StartResultSchema,
	output: {
		cases: [
			{
				id: "json",
				when: {},
				mode: "json",
				description: "Server startup state",
				presentation: ["diagnostics", "result"],
			},
		],
		/**
		 * Start has one output shape.
		 * @returns The JSON case id.
		 */
		select: () => "json",
	},
	prerequisites: [],
	effects: ["local-write"],
	refusals: [
		{
			code: "CANVAS_UNREACHABLE",
			exit: 3,
			stream: "stderr",
			description: "The explicitly started server did not become healthy.",
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
	/**
	 * Starts the server even when automatic start is opted out, reporting whether a process
	 * was spawned or one was already serving.
	 * @returns The running state, plus a diagnostic when the server was already up.
	 */
	async handler() {
		const result = await ensureServerRunning({ force: true });
		return {
			result: {
				running: true as const,
				url: result.url,
				spawned: result.spawned,
				pid: readPidFile(serverPort()) ?? undefined,
			},
			...(result.spawned
				? {}
				: { diagnostics: [`Archboard server already running at ${result.url}`] }),
		};
	},
});

const StopInputSchema = z.object({ tail: IgnoredTailSchema });
type StopInput = z.infer<typeof StopInputSchema>;

const StopResultSchema = z.object({
	stopped: z.boolean(),
	pid: z.number().int().positive().optional(),
	message: z.string(),
});
type StopResult = z.infer<typeof StopResultSchema>;

const stopContract = defineCommand({
	path: ["stop"],
	shared: ["url"],
	summary: "Stop the Archboard server",
	description: "Stops only a live process that identifies itself as this Archboard server.",
	examples: ["archboard stop"],
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
	input: { ingress: StopInputSchema },
	result: StopResultSchema,
	output: {
		cases: [
			{
				id: "json",
				when: {},
				mode: "json",
				description: "Identity-safe stop result",
				presentation: ["result"],
			},
		],
		/**
		 * Stop has one output shape.
		 * @returns The JSON case id.
		 */
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
	/**
	 * Stops the local server after it identifies itself as this service.
	 * @returns The stop result from the spawn owner.
	 */
	async handler() {
		return { result: await stopServer() };
	},
});

export {
	StartInputSchema,
	type StartInput,
	StartResultSchema,
	type StartResult,
	startContract,
	StopInputSchema,
	type StopInput,
	StopResultSchema,
	type StopResult,
	stopContract,
};
