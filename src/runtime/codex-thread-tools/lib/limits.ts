import { z } from "zod";

import { CODEX_BROWSER_COMMAND_LEASE_MS } from "@/shared/timing/timing";

const WAIT_THREADS_TIMEOUT_MAX_MS: number = 120_000;

if (WAIT_THREADS_TIMEOUT_MAX_MS >= CODEX_BROWSER_COMMAND_LEASE_MS) {
	throw new TypeError("wait_threads timeout maximum must stay below the browser command lease.");
}

const JsonValueSchema = z.json();

/**
 * Whether a UTF-16 code unit opens a surrogate pair.
 * @param codeUnit - The code unit.
 * @returns True for a high surrogate.
 */
function isHighSurrogate(codeUnit: number): boolean {
	return codeUnit >= 0xd800 && codeUnit <= 0xdbff;
}

/**
 * Whether a UTF-16 code unit closes a surrogate pair.
 * @param codeUnit - The code unit.
 * @returns True for a low surrogate.
 */
function isLowSurrogate(codeUnit: number): boolean {
	return codeUnit >= 0xdc00 && codeUnit <= 0xdfff;
}

/**
 * Whether a string contains no lone surrogate. Text that is not well-formed cannot be encoded as
 * UTF-8 without replacement, so it is refused before it reaches a tool argument or result rather
 * than silently changing on the way out.
 * @param value - The text to check.
 * @returns True when every surrogate is part of a pair.
 */
function isWellFormedUnicode(value: string): boolean {
	for (let index = 0; index < value.length; index++) {
		const codeUnit = value.charCodeAt(index);
		if (isLowSurrogate(codeUnit)) {
			return false;
		}
		if (isHighSurrogate(codeUnit)) {
			if (!isLowSurrogate(value.charCodeAt(index + 1))) {
				return false;
			}
			index++;
		}
	}
	return true;
}

/**
 * Enforce the JSON Schema string length in Unicode code points, which is what the manifest's
 * limits are written in; counting UTF-16 units instead would reject valid text.
 * @param maximum - The code-point ceiling.
 * @returns The schema.
 */
const boundedText = (maximum: number) =>
	z
		.string()
		.min(1)
		.superRefine((value, context) => {
			if (!isWellFormedUnicode(value)) {
				context.addIssue({ code: "custom", message: "text must be well-formed Unicode" });
			}
			if (Array.from(value).length > maximum) {
				context.addIssue({ code: "custom", message: `text exceeds ${maximum} code points` });
			}
		});

/**
 * Enforce an explicit UTF-8 byte ceiling without imposing a second code-point limit, for fields
 * whose limit is about what goes on the wire.
 * @param maximum - The UTF-8 byte ceiling.
 * @returns The schema.
 */
const boundedUtf8Text = (maximum: number) =>
	z
		.string()
		.min(1)
		.superRefine((value, context) => {
			if (!isWellFormedUnicode(value)) {
				context.addIssue({ code: "custom", message: "text must be well-formed Unicode" });
			}
			if (Buffer.byteLength(value, "utf8") > maximum) {
				context.addIssue({ code: "custom", message: `text exceeds ${maximum} UTF-8 bytes` });
			}
		});

/**
 * A bounded text field that may also be null.
 * @param maximum - The code-point ceiling.
 * @returns The schema.
 */
const nullableText = (maximum: number) => boundedText(maximum).nullable();

/**
 * A byte-bounded text field that may also be null.
 * @param maximum - The UTF-8 byte ceiling.
 * @returns The schema.
 */
const nullableUtf8Text = (maximum: number) => boundedUtf8Text(maximum).nullable();

export {
	WAIT_THREADS_TIMEOUT_MAX_MS,
	JsonValueSchema,
	boundedText,
	boundedUtf8Text,
	nullableText,
	nullableUtf8Text,
};
