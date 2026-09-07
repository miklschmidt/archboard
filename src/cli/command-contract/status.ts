import { z } from "zod";
import { getHealth, getSyncStatus } from "@/runtime/engine/canvas-client";
import { EXPRESS_SERVER_URL } from "@/runtime/engine/config";
import { readPidFile } from "@/runtime/engine/pidfile";
import { canvasPort, isCanvasHealth } from "@/runtime/engine/spawn";
import { defineCommand } from "@/cli/command-contract/contract";
import { ServerStateSchema } from "@/cli/command-contract/schemas";

const tail = z.array(z.string()).default([]);

const StatusInputSchema = z.object({ tail });
type StatusInput = z.infer<typeof StatusInputSchema>;

const StaleSourceSchema = z.object({
	startedAt: z.string(),
	changedFile: z.string(),
	changedAt: z.string(),
	says: z.string(),
});

const StatusUnavailableResultSchema = ServerStateSchema.extend({
	running: z.literal(false),
});
type StatusUnavailableResult = z.infer<typeof StatusUnavailableResultSchema>;

const StatusForeignServiceResultSchema = StatusUnavailableResultSchema.extend({
	conflict: z.string(),
});
type StatusForeignServiceResult = z.infer<typeof StatusForeignServiceResultSchema>;

const StatusRunningResultSchema = z.looseObject({
	running: z.literal(true),
	url: z.string(),
	pid: z.number().int().optional(),
	elements: z.number().int().nonnegative(),
	browserClients: z.number().int().nonnegative(),
	stale: StaleSourceSchema.optional(),
});
type StatusRunningResult = z.infer<typeof StatusRunningResultSchema>;

const StatusResultSchema = z.union([
	StatusUnavailableResultSchema,
	StatusForeignServiceResultSchema,
	StatusRunningResultSchema,
]);
type StatusResult = z.infer<typeof StatusResultSchema>;

/**
 * Reads a timestamp as a wall-clock time, which is what a person comparing
 * "when it started" against "when the file changed" actually needs.
 * @param at - The timestamp, as the server wrote it.
 * @returns The local time of day.
 */
const clock = (at: string): string => new Date(at).toLocaleTimeString();

/**
 * Tells the person their canvas is answering from code older than the files on
 * disk, and what to do about it. A running server read its source at start, so
 * editing source changes the next command, not the process already running.
 * @param health - The health the canvas reported.
 * @returns What is stale and what to say about it, or null when the source is current.
 */
function staleSource(health: Awaited<ReturnType<typeof getHealth>>) {
	const source = health.source;
	if (!source?.stale || !source.newestFile || !source.newestAt) {
		return null;
	}
	const remedy =
		"Restart it to pick that up: `archboard stop && archboard start`. " +
		"Stop refuses while a board has held work that exists only in this process; resolve every reported hold first.";
	return {
		startedAt: source.evaluatedAt,
		changedFile: source.newestFile,
		changedAt: source.newestAt,
		says:
			`This canvas read its source at ${clock(source.evaluatedAt)} and ${source.newestFile} ` +
			`changed at ${clock(source.newestAt)}, so it is answering from the older code. ${remedy}`,
	};
}

/**
 * Reads the synchronization state, which is an addition to a status rather
 * than part of it: a canvas that answered its health has already reported
 * everything a status must contain.
 * @returns The synchronization fields, or nothing when they could not be read.
 */
async function bestEffortSyncStatus(): Promise<Record<string, unknown>> {
	try {
		return await getSyncStatus();
	} catch {
		return {};
	}
}

/**
 * The status of a canvas that answered: what it is holding, how many browsers
 * are looking at it, and a warning when it is running older code than the
 * files on disk. The pid falls back to the pid file for a canvas whose health
 * does not report one.
 * @param health - The health the canvas reported.
 * @param sync - The synchronization fields, empty when they could not be read.
 * @returns The running status, with the staleness warning as a diagnostic.
 */
function runningStatus(
	health: Awaited<ReturnType<typeof getHealth>>,
	sync: Record<string, unknown>,
) {
	const stale = staleSource(health);
	return {
		result: {
			running: true as const,
			url: EXPRESS_SERVER_URL,
			pid: health.pid ?? readPidFile(canvasPort()) ?? undefined,
			elements: health.elements_count,
			browserClients: health.websocket_clients,
			...(stale ? { stale } : {}),
			...sync,
		},
		...(stale ? { diagnostics: [stale.says] } : {}),
	};
}

const statusContract = defineCommand({
	path: ["status"],
	summary: "Canvas health, element count, browser clients",
	usage: "status",
	description:
		"Reports canvas availability, identity, source freshness, and synchronization state.",
	examples: ["archboard status"],
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
	input: { ingress: StatusInputSchema },
	result: StatusResultSchema,
	output: {
		cases: [
			{
				id: "json",
				when: {},
				mode: "json",
				held: "none",
				description: "Canvas status",
				presentation: ["result", "diagnostics"],
			},
		],
		/**
		 * Every status, running or not, is published as the same JSON shape.
		 * @returns The only output case's id.
		 */
		select: () => "json",
	},
	outcomes: [
		{
			id: "unavailable",
			exit: 3,
			description: "No canvas is answering at the configured URL.",
			stream: "stdout-only",
			held: "none",
			presentation: ["result"],
		},
		{
			id: "foreign-service",
			exit: 3,
			description: "Another service or an incompatible canvas is answering.",
			stream: "stdout-only",
			held: "none",
			presentation: ["result"],
		},
	],
	prerequisites: [],
	effects: ["read"],
	refusals: [],
	relationships: [
		{ method: "GET", path: "/health", cardinality: "one", description: "Identity and health" },
		{
			method: "GET",
			path: "/api/sync/status",
			cardinality: "conditional",
			description: "Best-effort synchronization state after valid health",
		},
	],
	/**
	 * Reports what is answering at the configured URL: nothing, something that
	 * is not this canvas, or the canvas with its counts, its source freshness
	 * and whatever synchronization state it can add.
	 * @returns The status as the command's result, with an outcome when no canvas answered.
	 */
	async handler() {
		let health;
		try {
			health = await getHealth();
		} catch {
			return {
				result: { running: false as const, url: EXPRESS_SERVER_URL },
				outcome: "unavailable",
			};
		}
		if (!isCanvasHealth(health)) {
			return {
				result: {
					running: false as const,
					url: EXPRESS_SERVER_URL,
					conflict: "another service (or a pre-1.1 canvas build) is answering at this URL",
				},
				outcome: "foreign-service",
			};
		}
		return runningStatus(health, await bestEffortSyncStatus());
	},
});

export {
	StatusInputSchema,
	type StatusInput,
	StatusUnavailableResultSchema,
	type StatusUnavailableResult,
	StatusForeignServiceResultSchema,
	type StatusForeignServiceResult,
	StatusRunningResultSchema,
	type StatusRunningResult,
	StatusResultSchema,
	type StatusResult,
	statusContract,
};
