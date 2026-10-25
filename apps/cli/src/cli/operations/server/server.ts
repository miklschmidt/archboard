import { z } from "zod";
import {
	ensureServerRunning,
	stopServer,
	restartServer,
} from "@archboard/server-lifecycle/server";
import { defineCommand } from "#cli/protocol/contract/contract.ts";

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
			code: "SERVER_UNREACHABLE",
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
				pid: result.pid,
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

const RestartInputSchema = z.object({ tail: IgnoredTailSchema });
type RestartInput = z.infer<typeof RestartInputSchema>;

const RestartResultSchema = StartResultSchema.extend({
	stop: StopResultSchema,
	frontendBuild: z.string().nullable(),
});
type RestartResult = z.infer<typeof RestartResultSchema>;

const restartContract = defineCommand({
	path: ["restart"],
	shared: ["url"],
	summary: "Stop the Archboard server, build the frontend and start it again",
	description:
		"Stops the server as stop does, builds the frontend of this checkout, and starts the server as start does, so the server runs the source and serves the bundle that are on disk now.",
	examples: ["archboard restart"],
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
	input: { ingress: RestartInputSchema },
	result: RestartResultSchema,
	output: {
		cases: [
			{
				id: "json",
				when: {},
				mode: "json",
				description: "The stop, the new bundle and the started server",
				presentation: ["result"],
			},
		],
		/**
		 * Restart has one output shape.
		 * @returns The JSON case id.
		 */
		select: () => "json",
	},
	prerequisites: [],
	effects: ["local-write"],
	refusals: [
		{
			code: "SERVER_UNREACHABLE",
			exit: 3,
			stream: "stderr",
			description:
				"The server could not be started again, so nothing was stopped, or the started server did not become healthy.",
		},
		{
			code: "FRONTEND_BUILD_FAILED",
			exit: 1,
			stream: "stderr",
			description: "The frontend build failed after the stop. The server stays stopped.",
		},
	],
	relationships: [
		{
			method: "GET",
			path: "/health",
			cardinality: "one",
			description: "Identity check before signaling a local process, and readiness of the new one",
		},
	],
	/**
	 * Stops the server, builds the frontend and starts the server again.
	 * @returns The stop result, the entry script of the new bundle and the started server.
	 */
	async handler() {
		const restarted = await restartServer();
		return {
			result: {
				running: true as const,
				url: restarted.url,
				spawned: restarted.spawned,
				pid: restarted.pid,
				stop: restarted.stop,
				frontendBuild: restarted.frontendBuild,
			},
		};
	},
});

export {
	RestartInputSchema,
	type RestartInput,
	RestartResultSchema,
	type RestartResult,
	restartContract,
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
