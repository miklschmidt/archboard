// One request to the canvas server, and the identity gate in front of it.

import { EXPRESS_SERVER_URL } from "@/runtime/engine/config";
import {
	noteHold,
	rememberVersion,
	withBoard,
	withWriteClaims,
} from "@/runtime/engine/lib/canvas-client-session";
import { isBoardRefusal } from "@/runtime/engine/lib/canvas-client-refusal";
import { isRecord, stringAt } from "@/runtime/engine/lib/unknown-record";

/** Identity marker the canvas server puts in /health (v1.1+). */
const CANVAS_SERVICE_NAME = "mcp-excalidraw-canvas";

// Revalidating identity gate in front of every /api request: mutations must
// not reach a foreign service squatting on the canvas port. The verification
// is cached only briefly (burst-coalescing TTL) so a long-lived client
// re-checks identity after its verified canvas goes away — a service swapped
// onto the port is refused within seconds, while batch operations (align =
// many concurrent requests) share a single probe instead of stampeding
// /health. Note this is defense-in-depth against accidents, not a security
// boundary: local processes can always reach a loopback port directly.
const IDENTITY_TTL_MS = 3000;
let identityVerifiedAt = 0;
let identityProbe: Promise<void> | null = null;

/**
 * The error for something that answers on the canvas port but is not the
 * canvas.
 * @returns The error, carrying the CANVAS_UNREACHABLE code.
 */
function foreignServiceError(): Error {
	return unreachableError(
		`Something is answering at ${EXPRESS_SERVER_URL} but does not identify as this canvas server ` +
			`(a pre-1.1 canvas build or an unrelated service on the port). ` +
			`Upgrade/stop that service, or point EXPRESS_SERVER_URL elsewhere.`,
	);
}

/**
 * An error the CLI reports as "no canvas to talk to".
 * @param message What went wrong.
 * @returns The error, carrying the CANVAS_UNREACHABLE code.
 */
function unreachableError(message: string): Error {
	const error: Error & { code?: string } = new Error(message);
	error.code = "CANVAS_UNREACHABLE";
	return error;
}

/**
 * Record that the canvas has just identified itself, so a caller that
 * verified it another way does not make this probe it again.
 */
function markCanvasIdentityVerified(): void {
	identityVerifiedAt = Date.now();
}

/**
 * The /health answer, or null when the probe could not reach the service at
 * all: connection-level unreachable (refused, reset, DNS) means the canvas is
 * down or booting, and the actual request should fail with its own error.
 * @returns The response, or null.
 * @throws {Error} When the service accepts the connection but never answers,
 * which fails closed: a listener that could still accept /api mutations.
 */
async function probeHealth(): Promise<Response | null> {
	try {
		return await fetch(`${EXPRESS_SERVER_URL}/health`, { signal: AbortSignal.timeout(1500) });
	} catch (error) {
		const name = isRecord(error) ? stringAt(error, "name") : undefined;
		if (name === "TimeoutError" || name === "AbortError") {
			throw unreachableError(
				`The service at ${EXPRESS_SERVER_URL} did not answer the /health identity probe within 1500ms — ` +
					`refusing to send it requests.`,
			);
		}
		return null;
	}
}

/**
 * Whether a /health answer is this canvas server's. Something answered, so
 * only a 200 carrying our identity may pass: a 404 or an HTML page here is a
 * foreign service, not a down canvas.
 * @param response The answer.
 * @returns True when the canvas identified itself.
 */
async function identifiesAsCanvas(response: Response): Promise<boolean> {
	if (!response.ok) {
		return false;
	}
	const health: unknown = await response.json().catch(() => null);
	return isRecord(health) && stringAt(health, "service") === CANVAS_SERVICE_NAME;
}

/**
 * One identity probe, shared by every request that starts while it runs.
 * @throws {Error} When something other than this canvas answers.
 */
async function verifyIdentity(): Promise<void> {
	try {
		const response = await probeHealth();
		if (response === null) {
			// Deliberately not marked verified, so the next call re-probes.
			return;
		}
		if (!(await identifiesAsCanvas(response))) {
			throw foreignServiceError();
		}
		identityVerifiedAt = Date.now();
	} finally {
		identityProbe = null;
	}
}

/**
 * Check the canvas is who it says it is before sending it anything, reusing
 * a probe already in flight and a recent verification.
 * @returns When the canvas has identified itself, or was already verified.
 * @throws {Error} When something other than this canvas answers.
 */
async function assertCanvasIdentity(): Promise<void> {
	if (Date.now() - identityVerifiedAt < IDENTITY_TTL_MS) {
		return;
	}
	identityProbe ??= verifyIdentity();
	return identityProbe;
}

/** An error carrying what the canvas said about the request it turned away. */
type CanvasError = Error & {
	code?: unknown;
	conflict?: unknown;
	available?: unknown;
	refusal?: unknown;
};

/**
 * The error for an answer that was not ok, carrying the canvas's own reason
 * and the structured body behind it.
 *
 * Refused board writes are results, not faults. Keeping their body on the
 * error means the CLI does not have to reconstruct what the canvas said, or
 * read the board after the refusal.
 * @param data The answer body.
 * @param response The answer.
 * @returns The error.
 */
function responseError(data: unknown, response: Response): Error {
	const body = isRecord(data) ? data : {};
	const error: CanvasError = new Error(
		stringAt(body, "error") ?? `HTTP server error: ${response.status} ${response.statusText}`,
	);
	describeFailure(error, body);
	if (isBoardRefusal(data)) {
		error.refusal = data;
	}
	return error;
}

/**
 * Put the canvas's own code on the error: a conflict is named as one, and any
 * other code it stated is carried through with the alternatives it offered.
 * @param error The error being built.
 * @param body The answer body.
 */
function describeFailure(error: CanvasError, body: Record<string, unknown>): void {
	if (body["conflict"]) {
		error.code = "BOARD_CONFLICT";
		error.conflict = body["conflict"];
		return;
	}
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
 * One request to the canvas, answered as JSON.
 *
 * Every canvas request carries the board when one was named, and every answer
 * is read for what it says about that board — whether it is still saving, and
 * which version of it this process has now been told about (TASK-091).
 * Attached and read here rather than at 30 call sites, so a route can never be
 * the one that forgot.
 * @param path The request path.
 * @param init The request, whose method decides whether write claims ride along.
 * @returns The answer body, as the route's own shape.
 * @throws {Error} When the canvas is not there, is not itself, or answers with a failure.
 */
async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
	await assertCanvasIdentity();
	const response = await fetch(
		`${EXPRESS_SERVER_URL}${withWriteClaims(withBoard(path), init?.method)}`,
		init,
	);
	const data: unknown = await response.json().catch(() => null);
	noteHold(data);
	rememberVersion(data);
	if (!response.ok) {
		throw responseError(data, response);
	}
	// The route's own answer shape, which is what its return type names. There
	// is no second description of it to check against.
	// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the route's declared answer shape
	return data as T;
}

/**
 * Whether an error is the network failing rather than the canvas answering.
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
	CANVAS_SERVICE_NAME,
	assertCanvasIdentity,
	foreignServiceError,
	isConnectionFailure,
	markCanvasIdentityVerified,
	requestJson,
	responseError,
};
