// The person's control over usage records: whether they are on, why, and the one-time notice.

import { isCI, isTest } from "std-env";
import { consentOf, type Consent } from "#runtime/consent/rules/consent.ts";
import {
	markNoticeShown,
	readSettings,
	removeRecords,
	telemetryDirectory,
	writeSettings,
} from "#runtime/store/telemetry-files.ts";

/** What `archboard telemetry` reports. */
interface TelemetryStatus {
	/** Whether usage is recorded and sent. */
	readonly on: boolean;
	/** Why it is off, or null when it is on. */
	readonly because: Exclude<Consent, { on: true }>["because"] | null;
	/** The random id that names this installation in every event. */
	readonly installationId: string;
	/** Where the records wait to be sent. */
	readonly directory: string;
}

/** The notice that the CLI prints once, on the first command that records. */
const NOTICE = [
	"Archboard sends anonymous usage counts and error reports to its maintainers.",
	"They never hold code, names, paths, prompts or error messages, and nothing is sent in CI.",
	"Turn it off with `archboard telemetry off` or DO_NOT_TRACK=1.",
	"Read more: https://github.com/miklschmidt/archboard/blob/main/INSTALL.md#usage-telemetry",
].join("\n");

/**
 * Whether this process records usage.
 * @param env The process environment.
 * @returns On, or off with the strongest reason.
 */
function currentConsent(env: Readonly<Record<string, string | undefined>> = process.env): Consent {
	const environmental = consentOf({ env, ci: isCI, test: isTest, turnedOff: false });
	if (!environmental.on) return environmental;
	return consentOf({
		env,
		ci: isCI,
		test: isTest,
		turnedOff: readSettings(telemetryDirectory(env)).turnedOff,
	});
}

/**
 * Report whether usage is recorded, and why not.
 * @returns The status.
 */
function telemetryStatus(): TelemetryStatus {
	const directory = telemetryDirectory(process.env);
	const consent = currentConsent();
	return {
		on: consent.on,
		because: consent.on ? null : consent.because,
		installationId: readSettings(directory).installationId,
		directory,
	};
}

/**
 * Turn usage records on or off for this installation. Turning them off deletes every record that
 * waits to be sent.
 * @param on Whether to record.
 * @returns The status after the change.
 */
function turnTelemetry(on: boolean): TelemetryStatus {
	const directory = telemetryDirectory(process.env);
	writeSettings(directory, { ...readSettings(directory), turnedOff: !on });
	markNoticeShown(directory);
	if (!on) removeRecords(directory);
	return telemetryStatus();
}

/**
 * Take the notice the first time that a process records usage.
 * @returns The notice, or null when usage is off or the notice was shown.
 */
function takeNotice(): string | null {
	if (!currentConsent().on) return null;
	return markNoticeShown(telemetryDirectory(process.env)) ? NOTICE : null;
}

export { currentConsent, takeNotice, telemetryStatus, turnTelemetry, type TelemetryStatus };
