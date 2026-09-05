import { z } from "zod";
import { getHealth, getSyncStatus } from "../../runtime/engine/canvas-client.js";
import { EXPRESS_SERVER_URL } from "../../runtime/engine/config.js";
import { readPidFile } from "../../runtime/engine/pidfile.js";
import { canvasPort, isCanvasHealth } from "../../runtime/engine/spawn.js";
import { defineCommand } from "./contract.js";
import { ServerStateSchema } from "./schemas.js";

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

const clock = (at: string): string => new Date(at).toLocaleTimeString();

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
		let sync: Record<string, unknown> = {};
		try {
			sync = await getSyncStatus();
		} catch {
			// Health alone remains a complete status result.
		}
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
