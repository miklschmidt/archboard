// The PostHog events that the sender makes of the local records (ADR 0079).

import type { DailyUsage } from "#runtime/rollup/rules/daily-usage.ts";
import type { ErrorReport } from "#runtime/records/protocol/records.ts";

/** One event of PostHog's capture API. */
interface CaptureEvent {
	readonly event: string;
	readonly distinct_id: string;
	readonly timestamp: string;
	readonly properties: Readonly<Record<string, unknown>>;
}

/** What every event says of the machine that sends it. */
interface Machine {
	/** The installation id. */
	readonly installationId: string;
	/** `process.platform`, such as `linux`. */
	readonly os: string;
	/** `process.arch`, such as `arm64`. */
	readonly arch: string;
}

/**
 * The properties that every event carries: no person profile, no location, and the surface
 * that sets product events apart from the public site's.
 * @param machine The sending machine.
 * @returns The common properties.
 */
function commonProperties(machine: Machine): Record<string, unknown> {
	return {
		$process_person_profile: false,
		$geoip_disable: true,
		$lib: "archboard",
		surface: "product",
		os: machine.os,
		arch: machine.arch,
	};
}

/**
 * The `daily usage` event of one installation's day. Its time is the last moment of the day, so
 * that PostHog counts it in that day.
 * @param day The UTC day, such as `2026-11-13`.
 * @param usage The day's counts.
 * @param machine The sending machine.
 * @returns The event.
 */
function dailyUsageEvent(day: string, usage: DailyUsage, machine: Machine): CaptureEvent {
	return {
		event: "daily usage",
		distinct_id: machine.installationId,
		timestamp: `${day}T23:59:59.999Z`,
		properties: { ...commonProperties(machine), ...usage, day },
	};
}

/**
 * The `$exception` event of one error, in the shape of PostHog's error tracking. The value is
 * the error's code or class, never its message.
 * @param report The error's report.
 * @param machine The sending machine.
 * @returns The event.
 */
function exceptionEvent(report: ErrorReport, machine: Machine): CaptureEvent {
	return {
		event: "$exception",
		distinct_id: machine.installationId,
		timestamp: report.t,
		properties: {
			...commonProperties(machine),
			process: report.process,
			operation: report.operation,
			error_code: report.code,
			exit: report.exit,
			agent: report.agent,
			runner: report.runner,
			version: report.version,
			install: report.install,
			$exception_list: [
				{
					type: report.type,
					value: report.code ?? report.type,
					mechanism: { handled: false, synthetic: false },
					stacktrace: {
						type: "raw",
						frames: report.frames.map((frame) => ({
							platform: "custom",
							lang: "javascript",
							function: frame.function,
							filename: frame.filename,
							lineno: frame.lineno,
							colno: frame.colno,
							in_app: true,
							resolved: true,
						})),
					},
				},
			],
		},
	};
}

export { dailyUsageEvent, exceptionEvent, type CaptureEvent, type Machine };
