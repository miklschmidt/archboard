// One request to the Archboard server, and the identity gate in front of it.

import { ARCHBOARD_URL } from "@/runtime/engine/config";
import { withBoard, withVault, withWriteClaims } from "@/runtime/engine/lib/server-client-session";
import { isBoardRefusal } from "@/runtime/engine/lib/server-client-refusal";
import { isRecord, stringAt } from "@/runtime/engine/lib/unknown-record";

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
 * @returns True when the server identified itself.
 */
async function identifiesAsServer(response: Response): Promise<boolean> {
	if (!response.ok) {
		return false;
	}
	const health: unknown = await response.json().catch(() => null);
	return isRecord(health) && stringAt(health, "service") === ARCHBOARD_SERVICE_NAME;
}

/**
 * One identity probe, shared by every request that starts while it runs.
 * @throws {Error} When something other than this server answers.
 */
async function verifyIdentity(): Promise<void> {
	try {
		const response = await probeHealth();
		if (response === null) {
			// Deliberately not marked verified, so the next call re-probes.
			return;
		}
		if (!(await identifiesAsServer(response))) {
			throw foreignServiceError();
		}
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
	refusal?: unknown;
};

/**
 * The error for an answer that was not ok, carrying the server's own reason
 * and the structured body behind it.
 *
 * Refused board writes are results, not faults. Keeping their body on the
 * error means the CLI does not have to reconstruct what the server said, or
 * read the board after the refusal.
 * @param data The answer body.
 * @param response The answer.
 * @returns The error.
 */
function responseError(data: unknown, response: Response): Error {
	const body = isRecord(data) ? data : {};
	const error: ServerError = new Error(
		stringAt(body, "error") ?? `HTTP server error: ${response.status} ${response.statusText}`,
	);
	describeFailure(error, body);
	if (isBoardRefusal(data)) {
		error.refusal = data;
	}
	return error;
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
 * Every server request carries the board when one was named, and every API
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
		`${ARCHBOARD_URL}${withWriteClaims(withVault(withBoard(path)), init?.method)}`,
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

/**
 * Whether an error is the network failing rather than the server answering.
 * @param error The thrown value.
 * @returns True when nothing was reached.
 */
function isConnectionFailure(error: unknown): boolean {
	if (!isRecord(error)) {
		return false;
	}
	const unreachable =
		stringAt(error, "name") === "ConnectionRefused" ||
		stringAt(error, "message")?.startsWith("Unable to connect.") === true;
	return unreachable || UNREACHABLE_CODES.has(failureCode(error) ?? "");
}

// The system errors that mean nothing answered.
const UNREACHABLE_CODES = new Set([
	"ECONNREFUSED",
	"ECONNRESET",
	"ENOTFOUND",
	"EAI_AGAIN",
	"ETIMEDOUT",
]);

/**
 * The system code behind a failure: the cause's when it has one, else the
 * error's own.
 * @param error The thrown value.
 * @returns The code, or undefined.
 */
function failureCode(error: Record<string, unknown>): string | undefined {
	const cause = error["cause"];
	return (isRecord(cause) ? stringAt(cause, "code") : undefined) ?? stringAt(error, "code");
}

export {
	ARCHBOARD_SERVICE_NAME,
	assertServerIdentity,
	foreignServiceError,
	isConnectionFailure,
	markServerIdentityVerified,
	requestJson,
	responseError,
};
