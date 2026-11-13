// `archboard telemetry`: whether this installation sends anonymous usage, and the switch
// (ADR 0079).

import { z } from "zod";
import { telemetryStatus, turnTelemetry } from "@archboard/telemetry/settings";
import { defineCommand } from "#cli/contract/protocol/contract.ts";

const TelemetryInputSchema = z.object({
	setting: z.enum(["on", "off", "status"]).default("status"),
});

const TelemetryResultSchema = z.object({
	on: z.boolean(),
	because: z.enum(["turned-off", "environment", "do-not-track", "ci", "test"]).nullable(),
	installationId: z.string(),
	directory: z.string(),
});

/** What each reason means for a person who reads the status. */
const REASONS = {
	"turned-off":
		"Off: `archboard telemetry off` turned it off. `archboard telemetry on` turns it on.",
	environment: "Off: ARCHBOARD_TELEMETRY turns it off in this environment.",
	"do-not-track": "Off: DO_NOT_TRACK turns it off in this environment.",
	ci: "Off: this is a CI environment, where Archboard never records usage.",
	test: "Off: this is a test run, where Archboard never records usage.",
} as const;

const telemetryContract = defineCommand({
	path: ["telemetry"],
	shared: [],
	summary: "Show or change whether Archboard sends anonymous usage counts and error reports",
	description: [
		"Archboard records each command and each unexpected error on this machine, and its server sends one usage event a day and one event for each error.",
		"",
		"No event holds code, a module, file, repository or model name, a path, a prompt or an error message.",
		"",
		"It is off in CI, in tests, when DO_NOT_TRACK is set, and when ARCHBOARD_TELEMETRY is 0. Turning it off deletes every record that waits to be sent.",
	].join("\n"),
	examples: ["archboard telemetry", "archboard telemetry off", "archboard telemetry on"],
	parameters: [
		{
			kind: "positional",
			key: "setting",
			name: "setting",
			placeholder: "on|off|status",
			description: "Turn it on or off, or show its status (the default)",
		},
	],
	input: { ingress: TelemetryInputSchema },
	result: TelemetryResultSchema,
	output: {
		cases: [
			{
				id: "json",
				when: {},
				mode: "json",
				description: "Telemetry status",
				presentation: ["diagnostics", "result"],
			},
		],
		/**
		 * Selects the only output case.
		 * @returns The json case id.
		 */
		select: () => "json",
	},
	prerequisites: [],
	effects: ["local-read", "local-write"],
	refusals: [],
	relationships: [],
	/**
	 * Turns usage records on or off, or reports their status.
	 * @param input - The parsed setting.
	 * @returns The status, with a diagnostic that says why it is off.
	 */
	async handler(input) {
		const status =
			input.setting === "status" ? telemetryStatus() : turnTelemetry(input.setting === "on");
		return {
			result: status,
			diagnostics: [status.because === null ? "On." : REASONS[status.because]],
		};
	},
});

export { telemetryContract };
