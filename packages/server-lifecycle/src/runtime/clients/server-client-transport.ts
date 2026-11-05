// One request to the Archboard server, and the identity gate in front of it.

import { ARCHBOARD_BROWSER_URL, ARCHBOARD_URL } from "#runtime/services/config.ts";
import { bothRelease, otherVersionWarning } from "#runtime/rules/release-version.ts";
import { withVault, withWriteClaims } from "#runtime/state/server-client-session.ts";
import { isRecord, stringAt } from "@archboard/diagnostics/unknown-record";
import { installation } from "@archboard/workspace/installation";

/** Identity marker the Archboard server puts in /health (v1.1+). */
const ARCHBOARD_SERVICE_NAME = "archboard-server";

// Revalidating identity gate in front of every /api request: mutations must
// not reach a foreign service squatting on the server port. The verification
// is cached only briefly (burst-coalescing TTL) so a long-lived client
// re-checks identity after its verified server goes away — a service swapped
// onto the port is refused within seconds, while batch operations (align =
// many concurrent requests) share a single probe instead of stampeding
// /health. Note this is defense-in-depth against accidents, not a security
// boundary: local processes can always reach a loopback port directly.
const IDENTITY_TTL_MS = 3000;
let identityVerifiedAt = 0;
let identityProbe: Promise<void> | null = null;

/**
 * The error for something that answers on the server port but is not the
 * Archboard server.
 * @returns The error, carrying the SERVER_UNREACHABLE code.
 */
function foreignServiceError(): Error {
	return unreachableError(
		`Something is answering at ${ARCHBOARD_URL} but does not identify as this Archboard server ` +
			`(a pre-1.1 server build or an unrelated service on the port). ` +
			`Upgrade/stop that service, or point ARCHBOARD_URL elsewhere.`,
	);
}

/**
 * The refusal for an Archboard server that runs the source of another
 * checkout than this command (ADR 0049). The command does not pick another
 * port, because the port is how a checkout and its server find each other.
 */
class OtherSourceError extends Error {
	readonly code = "SERVER_UNREACHABLE";

	/**
	 * The refusal that names both checkouts.
	 * @param serverCheckout The checkout whose source the server runs.
	 */
	constructor(serverCheckout: string) {
		super(
			`The Archboard server at ${ARCHBOARD_URL} runs the source of ${serverCheckout}, ` +
				`and this command runs the source of ${installation().root}. Run the command in ${serverCheckout}, ` +
				"stop that server there with `archboard stop`, or name another server with --url.",
		);
	}
}

/**
 * An error the CLI reports as "no server to talk to".
 * @param message What went wrong.
 * @returns The error, carrying the SERVER_UNREACHABLE code.
 */
function unreachableError(message: string): Error {
	const error: Error & { code?: string } = new Error(message);
	error.code = "SERVER_UNREACHABLE";
	return error;
}

/**
 * Record that the server has just identified itself, so a caller that
 * verified it another way does not make this probe it again.
 */
function markServerIdentityVerified(): void {
	identityVerifiedAt = Date.now();
}

/**
 * The /health answer, or null when the probe could not reach the service at
 * all: connection-level unreachable (refused, reset, DNS) means the server is
 * down or booting, and the actual request should fail with its own error.
 * @returns The response, or null.
 * @throws {Error} When the service accepts the connection but never answers,
 * which fails closed: a listener that could still accept /api mutations.
 */
async function probeHealth(): Promise<Response | null> {
	try {
		return await fetch(`${ARCHBOARD_URL}/health`, { signal: AbortSignal.timeout(1500) });
	} catch (error) {
		const name = isRecord(error) ? stringAt(error, "name") : undefined;
		if (name === "TimeoutError" || name === "AbortError") {
			throw unreachableError(
				`The service at ${ARCHBOARD_URL} did not answer the /health identity probe within 1500ms — ` +
					`refusing to send it requests.`,
			);
		}
		return null;
	}
}

/**
 * Whether a /health answer is this Archboard server's. Something answered, so
 * only a 200 carrying our identity may pass: a 404 or an HTML page here is a
 * foreign service, not a down server.
 * @param response The answer.
 * @returns The health body when the server identified itself, else null.
 */
async function serverHealthOf(response: Response): Promise<Record<string, unknown> | null> {
	if (!response.ok) {
		return null;
	}
	const health: unknown = await response.json().catch(() => null);
	return isRecord(health) && stringAt(health, "service") === ARCHBOARD_SERVICE_NAME ? health : null;
}

let versionWarned = false;

/**
 * Say once, on stderr, that the server runs another release version than the installed one. The
 * command goes on, because the server still answers it.
 * @param health The server's health body.
 */
function warnOfOtherVersion(health: Record<string, unknown>): void {
	const warning = otherVersionWarning(
		{ mode: stringAt(health, "mode"), version: stringAt(health, "version") },
		installation(),
		ARCHBOARD_BROWSER_URL,
	);
	if (warning !== null && !versionWarned) {
		versionWarned = true;
		process.stderr.write(`${warning}\n`);
	}
}

/**
 * Keep this process from warning about the server it is about to replace, because
 * `archboard restart` is the remedy that the warning names.
 */
function silenceVersionWarning(): void {
	versionWarned = true;
}

/**
 * The checkout a server says it runs the source of, when it is not this
 * command's. A server older than ADR 0049 names none and is taken as it is. A
 * release is no checkout: two releases differ by their version, not their location.
 * @param health The server's health body.
 * @returns The server's checkout, or undefined when it matches or is not named.
 */
function otherSourceOf(health: Record<string, unknown>): string | undefined {
	if (bothRelease({ mode: stringAt(health, "mode") }, installation())) {
		return undefined;
	}
	const source = health["source"];
	const checkout = isRecord(source) ? stringAt(source, "checkout") : undefined;
	return checkout === installation().root ? undefined : checkout;
}

/**
 * One identity probe, shared by every request that starts while it runs.
 * @throws {Error} When something other than this server answers, or a server
 * that runs another checkout's source.
 */
async function verifyIdentity(): Promise<void> {
	try {
		const response = await probeHealth();
		if (response === null) {
			// Deliberately not marked verified, so the next call re-probes.
			return;
		}
		const health = await serverHealthOf(response);
		if (health === null) {
			throw foreignServiceError();
		}
		const otherSource = otherSourceOf(health);
		if (otherSource !== undefined) {
			throw new OtherSourceError(otherSource);
		}
		warnOfOtherVersion(health);
		identityVerifiedAt = Date.now();
	} finally {
		identityProbe = null;
	}
}

/**
 * Check the server is who it says it is before sending it anything, reusing
 * a probe already in flight and a recent verification.
 * @returns When the server has identified itself, or was already verified.
 * @throws {Error} When something other than this server answers.
 */
async function assertServerIdentity(): Promise<void> {
	if (Date.now() - identityVerifiedAt < IDENTITY_TTL_MS) {
		return;
	}
	identityProbe ??= verifyIdentity();
	return identityProbe;
}

/** An error carrying what the server said about the request it turned away. */
type ServerError = Error & {
	code?: unknown;
	available?: unknown;
	/** The whole body the server answered with, for a route whose refusal says more than its reason. */
	answer?: Record<string, unknown>;
};

/**
 * The error for an answer that was not ok, carrying the server's own reason
 * and the structured body behind it.
 *
 * Refused model writes are results, not faults. Keeping their body on the
 * error means the CLI does not have to reconstruct what the server said, or
 * read the model after the refusal.
 * @param data The answer body.
 * @param response The answer.
 * @returns The error.
 */
function responseError(data: unknown, response: Response): Error {
	const body = isRecord(data) ? data : {};
	const reason =
		stringAt(body, "error") ?? `HTTP server error: ${response.status} ${response.statusText}`;
	const error: ServerError = new Error([reason, ...diagnosticLines(body)].join("\n"));
	describeFailure(error, body);
	error.answer = body;
	return error;
}

/**
 * The diagnostics an answer carries, each as its code, the file it is about, what it says and
 * what to do next, because a refusal's reason alone names none of them.
 * @param body The answer body.
 * @returns One line for each diagnostic that has a code and a message.
 */
function diagnosticLines(body: Record<string, unknown>): string[] {
	const diagnostics = body["diagnostics"];
	if (!Array.isArray(diagnostics)) {
		return [];
	}
	return diagnostics.filter(isRecord).flatMap((diagnostic) => {
		const code = stringAt(diagnostic, "code");
		const message = stringAt(diagnostic, "message");
		if (code === undefined || message === undefined) {
			return [];
		}
		const file = stringAt(diagnostic, "file");
		const recovery = stringAt(diagnostic, "recovery");
		return [
			`${code}${file === undefined ? "" : ` ${file}`}: ${message}${recovery === undefined ? "" : ` ${recovery}`}`,
		];
	});
}

/**
 * Put the server's own code on the error, with the alternatives it offered.
 * @param error The error being built.
 * @param body The answer body.
 */
function describeFailure(error: ServerError, body: Record<string, unknown>): void {
	const code = stringAt(body, "code");
	if (code === undefined) {
		return;
	}
	error.code = code;
	if (Array.isArray(body["available"])) {
		error.available = body["available"];
	}
}

/**
 * One request to the Archboard server, answered as JSON.
 *
 * Every server request carries the model when one was named, and every API
 * request carries the vault (ADR 0049). Attached here rather than at 30 call
 * sites, so a route can never be the one that forgot.
 * @param path The request path.
 * @param init The request, whose method decides whether write claims ride along.
 * @returns The answer body, as the route's own shape.
 * @throws {Error} When the server is not there, is not itself, or answers with a failure.
 */
async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
	await assertServerIdentity();
	const response = await fetch(
		`${ARCHBOARD_URL}${withWriteClaims(withVault(path), init?.method)}`,
		init,
	);
	const data: unknown = await response.json().catch(() => null);
	if (!response.ok) {
		throw responseError(data, response);
	}
	// The route's own answer shape, which is what its return type names. There
	// is no second description of it to check against.
	// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the route's declared answer shape
	return data as T;
}

export {
	ARCHBOARD_SERVICE_NAME,
	foreignServiceError,
	markServerIdentityVerified,
	OtherSourceError,
	requestJson,
	silenceVersionWarning,
};
