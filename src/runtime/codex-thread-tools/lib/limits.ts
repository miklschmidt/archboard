import { z } from "zod";

import { CODEX_BROWSER_COMMAND_LEASE_MS } from "../../../shared/timing/timing.js";

export const WAIT_THREADS_TIMEOUT_MAX_MS = 120_000 as const;

if (WAIT_THREADS_TIMEOUT_MAX_MS >= CODEX_BROWSER_COMMAND_LEASE_MS)
	throw new TypeError("wait_threads timeout maximum must stay below the browser command lease.");

export const JsonValueSchema = z.json();

function isWellFormedUnicode(value: string): boolean {
	for (let index = 0; index < value.length; index++) {
		const codeUnit = value.charCodeAt(index);
		if (codeUnit >= 0xd800 && codeUnit <= 0xdbff) {
			const next = value.charCodeAt(index + 1);
			if (Number.isNaN(next) || next < 0xdc00 || next > 0xdfff) return false;
			index++;
		} else if (codeUnit >= 0xdc00 && codeUnit <= 0xdfff) return false;
	}
	return true;
}

/** Enforce JSON Schema code-point length and the authored UTF-8 byte ceiling. */
export const boundedText = (maximum: number) =>
	z
		.string()
		.min(1)
		.superRefine((value, context) => {
			if (!isWellFormedUnicode(value))
				context.addIssue({ code: "custom", message: "text must be well-formed Unicode" });
			if (Array.from(value).length > maximum)
				context.addIssue({ code: "custom", message: `text exceeds ${maximum} code points` });
			if (value.includes("\0"))
				context.addIssue({ code: "custom", message: "text must not contain NUL" });
			if (Buffer.byteLength(value, "utf8") > maximum)
				context.addIssue({ code: "custom", message: `text exceeds ${maximum} UTF-8 bytes` });
		});

export const nullableText = (maximum: number) => boundedText(maximum).nullable();
