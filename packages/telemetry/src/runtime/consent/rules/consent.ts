// Whether this process records usage (ADR 0079). The answer names the strongest reason, so that
// `archboard telemetry` can say which one applies.

/** Why usage is not recorded, strongest first. */
type OffReason = "turned-off" | "environment" | "do-not-track" | "ci" | "test";

/** Whether usage is recorded, and if not, why. */
type Consent = { readonly on: true } | { readonly on: false; readonly because: OffReason };

/** What the decision reads. */
interface ConsentInputs {
	/** The process environment. */
	readonly env: Readonly<Record<string, string | undefined>>;
	/** Whether `std-env` detected a CI environment. */
	readonly ci: boolean;
	/** Whether `std-env` detected a test run. */
	readonly test: boolean;
	/** Whether the person ran `archboard telemetry off`. */
	readonly turnedOff: boolean;
}

/** Values of `ARCHBOARD_TELEMETRY` that turn usage off. */
const OFF_VALUES = new Set(["0", "false", "off", "no"]);

/** Values of `DO_NOT_TRACK` that do not ask for anything. */
const UNSET_VALUES = new Set(["", "0", "false"]);

/**
 * A variable's value, trimmed and in lower case, or an empty string when it is not set.
 * @param value The raw value.
 * @returns The normalized value.
 */
function normalized(value: string | undefined): string {
	return value?.trim().toLowerCase() ?? "";
}

/**
 * The strongest reason that turns usage off.
 * @param inputs The environment, the detections and the person's setting.
 * @returns The reason, or null when none applies.
 */
function offReason(inputs: ConsentInputs): OffReason | null {
	if (inputs.turnedOff) return "turned-off";
	if (OFF_VALUES.has(normalized(inputs.env["ARCHBOARD_TELEMETRY"]))) return "environment";
	if (!UNSET_VALUES.has(normalized(inputs.env["DO_NOT_TRACK"]))) return "do-not-track";
	if (inputs.ci) return "ci";
	if (inputs.test) return "test";
	return null;
}

/**
 * Decide whether this process records usage.
 * @param inputs The environment, the detections and the person's setting.
 * @returns On, or off with the strongest reason.
 */
function consentOf(inputs: ConsentInputs): Consent {
	const because = offReason(inputs);
	return because === null ? { on: true } : { on: false, because };
}

export { consentOf, type Consent, type ConsentInputs, type OffReason };
