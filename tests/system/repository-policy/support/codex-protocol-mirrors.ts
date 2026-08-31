import type * as ts from "typescript/unstable/ast";
import {
	astFingerprint,
	distinctiveFingerprints,
} from "../../../../scripts/codex-protocol-fingerprints.js";
import type { AstFingerprint } from "../../../../scripts/codex-protocol-fingerprints.js";

export { astFingerprint, distinctiveFingerprints };
export type { AstFingerprint };

function nearMatch(candidate: AstFingerprint, generated: AstFingerprint): boolean {
	const length = Math.max(candidate.length, generated.length);
	if (length < 24 || Math.abs(candidate.length - generated.length) > length * 0.05) return false;
	let prefix = 0;
	while (
		prefix < candidate.length &&
		prefix < generated.length &&
		candidate[prefix] === generated[prefix]
	)
		prefix++;
	let suffix = 0;
	while (
		suffix < candidate.length - prefix &&
		suffix < generated.length - prefix &&
		candidate[candidate.length - suffix - 1] === generated[generated.length - suffix - 1]
	)
		suffix++;
	return prefix + suffix >= length * 0.96;
}

export function isGeneratedMirror(
	candidate: ts.SourceFile,
	generated: readonly AstFingerprint[],
): boolean {
	const fingerprint = astFingerprint(candidate);
	return generated.some(
		(reference) =>
			(fingerprint.length === reference.length &&
				fingerprint.every((token, index) => token === reference[index])) ||
			nearMatch(fingerprint, reference),
	);
}
