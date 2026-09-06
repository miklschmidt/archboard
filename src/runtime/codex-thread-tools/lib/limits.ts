import { z } from "zod";

import { CODEX_BROWSER_COMMAND_LEASE_MS } from "@/shared/timing/timing";

const WAIT_THREADS_TIMEOUT_MAX_MS = 120_000 as const;

if (WAIT_THREADS_TIMEOUT_MAX_MS >= CODEX_BROWSER_COMMAND_LEASE_MS) {
	throw new TypeError("wait_threads timeout maximum must stay below the browser command lease.");
}

const JsonValueSchema = z.json();

/**
 *
 */
function isWellFormedUnicode(value: string): boolean {
	for (let index = 0; index < value.length; index++) {
		const codeUnit = value.charCodeAt(index);
		if (codeUnit >= 0xd800 && codeUnit <= 0xdbff) {
			const next = value.charCodeAt(index + 1);
			if (Number.isNaN(next) || next < 0xdc00 || next > 0xdfff) {
				return false;
			}
			index++;
		} else if (codeUnit >= 0xdc00 && codeUnit <= 0xdfff) {
			return false;
		}
	}
	return true;
}

/** Enforce the JSON Schema string length in Unicode code points. */
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

/** Enforce an explicit UTF-8 byte ceiling without imposing a second code-point limit. */
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
 *
 */
const nullableText = (maximum: number) => boundedText(maximum).nullable();
/**
 *
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
