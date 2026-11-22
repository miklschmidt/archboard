// A dependency the code calls (TASK-663.05): `DEPENDENCY_CALLED`.
//
// A dependency is a declared requirement: nothing of its target runs at run
// time, which is why it is the one kind that may state no effect. A type
// import and a build declaration are dependencies. A use at run time of a
// function or a value of the target is call evidence, and makes the
// relationship a call of some kind with an effect. The check judges this
// whatever evidence the vault lets a dependency accept, so the one way to
// state no effect stays closed in every vault. The evidence is the anchored
// use, or, on a relationship with no anchor, the evidence from its start to
// its end. The finding is information: the relationship is real, and only
// its kind and effect are to be stated.

import type { ClaimSite } from "#runtime/code-check/claims/operations/claims.ts";
import type { CodeEvidence, CodeFinding } from "#shared/protocol/code-check.ts";
import { describeSubject, isEffectlessKind } from "@archboard/model/policy";

/**
 * The finding about a dependency whose evidence is a call into its end, if it is one.
 * @param site Where the relationship sits, and its subject, which names both ends.
 * @param kind Its kind.
 * @param evidence Its anchored uses, or the evidence from its start to its end.
 * @returns The finding, or undefined for another kind or evidence with no call.
 */
function dependencyCalled(
	site: ClaimSite,
	kind: string,
	evidence: readonly CodeEvidence[],
): CodeFinding | undefined {
	if (!isEffectlessKind(kind)) return undefined;
	const calls = evidence.filter((piece) => piece.kind === "call");
	if (calls.length === 0) return undefined;
	const what = [...new Set(calls.map((piece) => JSON.stringify(piece.symbol)))].join(", ");
	const unsure = calls.every((piece) => piece.resolution === "candidate")
		? " The use is a candidate, matched by name only until a language server resolves it."
		: "";
	return {
		...site,
		severity: "information",
		code: "DEPENDENCY_CALLED",
		message:
			`The ${describeSubject(site.subject)} is a ${kind}, and its start runs ${what} of its end ` +
			`at run time, while nothing of a ${kind}'s target runs then.${unsure} State the call: ` +
			"the kind it travels by and its effect, mutation, query or compute. Keep a dependency " +
			"for a type import or a build declaration.",
		evidence: calls,
	};
}

export { dependencyCalled };
