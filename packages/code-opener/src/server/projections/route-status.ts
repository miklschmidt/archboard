import type { CodeTargetFailureCode } from "#shared/schemas/code-target-open.ts";

const BODY_PARSER_FAILURES: ReadonlySet<string> = new Set([
	"charset.unsupported",
	"encoding.unsupported",
	"entity.parse.failed",
	"entity.too.large",
	"entity.verify.failed",
	"request.aborted",
	"request.size.invalid",
	"stream.encoding.set",
	"stream.not.readable",
]);

/** HTTP statuses for the failure codes that are not a plain 422 refusal. */
const FAILURE_STATUSES: Readonly<Partial<Record<CodeTargetFailureCode, number>>> = {
	CROSS_ORIGIN_REFUSED: 403,
	MODEL_UNAVAILABLE: 404,
	CHECKOUT_IDENTITY_CHANGED: 409,
	CHECKOUT_ON_OTHER_REF: 409,
	OPENER_SPAWN_FAILED: 500,
	OPENER_CONFIG_INVALID: 500,
};

/**
 * Maps a failure code to the HTTP status a route answers with.
 * @param code The failure code.
 * @returns The status; refusals without a specific status are 422.
 */
function statusFor(code: CodeTargetFailureCode): number {
	return FAILURE_STATUSES[code] ?? 422;
}

/**
 * Tells whether a thrown value is one of the body parser's own failures.
 * @param error The value the body parser passed to the error pipeline.
 * @returns True when the error's type is a known body-parser failure.
 */
function isBodyParserFailure(error: unknown): boolean {
	return (
		typeof error === "object" &&
		error !== null &&
		"type" in error &&
		typeof error.type === "string" &&
		BODY_PARSER_FAILURES.has(error.type)
	);
}

export { isBodyParserFailure, statusFor };
