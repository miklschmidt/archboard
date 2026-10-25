import { z } from "zod";
import { serverStatus } from "@archboard/server-lifecycle/server";
import { defineCommand } from "#cli/protocol/contract/contract.ts";
import { ServerStateSchema } from "#cli/protocol/contract/schemas.ts";

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
	browserClients: z.number().int().nonnegative().optional(),
	stale: StaleSourceSchema.optional(),
});
type StatusRunningResult = z.infer<typeof StatusRunningResultSchema>;

const StatusResultSchema = z.union([
	StatusUnavailableResultSchema,
	StatusForeignServiceResultSchema,
	StatusRunningResultSchema,
]);
type StatusResult = z.infer<typeof StatusResultSchema>;

/** A server that answered as itself, as the status operation reports it. */
type RunningServer = Extract<Awaited<ReturnType<typeof serverStatus>>, { state: "running" }>;

/**
 * Reads a timestamp as a wall-clock time, which is what a person comparing
 * "when it started" against "when the file changed" actually needs.
 * @param at - The timestamp, as the server wrote it.
 * @returns The local time of day.
 */
const clock = (at: string): string => new Date(at).toLocaleTimeString();

/**
 * Tells the person their Archboard server is answering from code older than the files on
 * disk, and what to do about it. A running server read its source at start, so
 * editing source changes the next command, not the process already running.
 * @param source - The source state the server reported.
 * @returns What is stale and what to say about it, or null when the source is current.
 */
function staleSource(source: RunningServer["source"]) {
	if (!source?.stale || !source.newestFile || !source.newestAt) {
		return null;
	}
	const remedy = "Restart it to pick that up: `archboard restart`.";
	return {
		startedAt: source.evaluatedAt,
		changedFile: source.newestFile,
		changedAt: source.newestAt,
		says:
			`This Archboard server read its source at ${clock(source.evaluatedAt)} and ${source.newestFile} ` +
			`changed at ${clock(source.newestAt)}, so it is answering from the older code. ${remedy}`,
	};
}

/**
 * The status of a server that answered: how many browsers are looking at it,
 * and a warning when it is running older code than the files on disk.
 * @param running - The running server.
 * @returns The running status, with the staleness warning as a diagnostic.
 */
function runningStatus(running: RunningServer) {
	const stale = staleSource(running.source);
	return {
		result: {
			// Synchronization first, so health stays the authority for what it and
			// the sync route both answer.
			...running.sync,
			running: true as const,
			url: running.url,
			pid: running.pid,
			browserClients: running.browserClients,
			...(stale ? { stale } : {}),
		},
		...(stale ? { diagnostics: [stale.says] } : {}),
	};
}

const statusContract = defineCommand({
	path: ["status"],
	shared: ["url"],
	summary: "Archboard server health and browser clients",
	description:
		"Reports Archboard server availability, identity, source freshness, and synchronization state.",
	examples: ["archboard status"],
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
	input: { ingress: StatusInputSchema },
	result: StatusResultSchema,
	output: {
		cases: [
			{
				id: "json",
				when: {},
				mode: "json",
				description: "Archboard server status",
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
			description: "No Archboard server is answering at the configured URL.",
			stream: "stdout-only",
			presentation: ["result"],
		},
		{
			id: "foreign-service",
			exit: 3,
			description:
				"Another service, an incompatible Archboard server or a server of another checkout's source is answering.",
			stream: "stdout-only",
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
	 * is not this server, or the server with its client count, its source freshness
	 * and whatever synchronization state it can add.
	 * @returns The status as the command's result, with an outcome when no server answered.
	 */
	async handler() {
		const status = await serverStatus();
		if (status.state === "running") {
			return runningStatus(status);
		}
		return status.state === "conflict"
			? {
					result: { running: false as const, url: status.url, conflict: status.conflict },
					outcome: "foreign-service",
				}
			: { result: { running: false as const, url: status.url }, outcome: "unavailable" };
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
