// Whether a relationship's kind says how its anchored call runs (TASK-663.09,
// ADR 0094): `CALL_TIMING_MISMATCH`.
//
// `sync` says the caller has the answer when the call returns, and `async`
// that the call returns before the work is done. An anchor names the call,
// and the code facts of its file say how each site of it runs the callee
// (call-timing.ts). A `sync` relationship whose anchored calls are all
// awaited or started, or an `async` one whose anchored calls are all plain,
// gets this finding, as information: the relationship is real, and only its
// kind is to be stated again. Where one site is unknown, or the sites
// disagree, the code does not decide, and the check says nothing.
//
// An unawaited call in a language where its callee decides is resolved
// through the callee's definition: in its own file or where an import leads,
// else where the file's language server says it is.

import type { AnchorClaim } from "#runtime/code-check/claims/operations/claims.ts";
import type { ReadCheckout } from "#runtime/code-check/operations/checkouts.ts";
import { innermostAt, type Resolve } from "#runtime/code-check/operations/resolution.ts";
import {
	anchoredCalls,
	calleeInCode,
	type AnchoredCall,
	type FindCallee,
} from "#runtime/code-facts/operations/anchored-calls.ts";
import { callKindOf } from "#runtime/code-facts/operations/call-timing.ts";
import type { FileFacts, SyntaxFacts } from "#runtime/code-facts/operations/facts.ts";
import type { FactsPass } from "#runtime/code-facts/services/reader.ts";
import type { CodeEvidence, CodeFinding } from "#shared/protocol/code-check.ts";
import { describeSubject } from "@archboard/model/policy";

/** The kinds whose anchored call the check holds to its timing. */
const TIMED_KINDS: ReadonlySet<string> = new Set(["sync", "async"]);

/** What finding a callee needs: the pass's code facts and servers, and the checkout. */
interface CalleeSearch {
	readonly facts: FactsPass;
	readonly resolve: Resolve;
	readonly checkout: ReadCheckout;
}

/**
 * Finds a callee through code facts, then through the file's language server.
 * @param search The pass and the checkout.
 * @param file The calling file.
 * @returns The finder.
 */
function calleeThroughServers(search: CalleeSearch, file: string): FindCallee {
	const inCode = calleeInCode(search.facts, search.checkout, file);
	return async (reference) => {
		const found = await inCode(reference);
		if (found !== undefined) return found;
		const site = await search.resolve(search.checkout, file, reference);
		if (site.status !== "site") return undefined;
		const read = await search.facts.read(search.checkout, site.path);
		return read === undefined || read.adapter === "text"
			? undefined
			: innermostAt(read.definitions, site.line);
	};
}

/**
 * One anchored call as evidence, with its timing.
 * @param claim The anchor.
 * @param path The anchored file.
 * @param call The call.
 * @returns The evidence.
 */
function evidenceOf(claim: AnchorClaim, path: string, call: AnchoredCall): CodeEvidence {
	return {
		kind: "call",
		resolution: call.exact ? "resolved" : "candidate",
		repo: claim.anchor.repo,
		path,
		line: call.reference.line,
		symbol: call.reference.symbol,
		timing: call.timing,
	};
}

/**
 * The finding's message for a kind its calls contradict.
 * @param claim The anchor.
 * @param kind The relationship's kind.
 * @param calls Its anchored calls.
 * @returns The message.
 */
function messageOf(claim: AnchorClaim, kind: string, calls: readonly AnchoredCall[]): string {
	const subject = describeSubject(claim.site.subject);
	const how = [...new Set(calls.map((call) => call.timing))].join(" and ");
	const call = `its anchor's call of ${JSON.stringify(claim.anchor.symbol)} in ${claim.anchor.path} is ${how}`;
	const unsure = calls.every((each) => each.exact)
		? ""
		: " The call is a candidate, matched by its last name only.";
	return kind === "sync"
		? `The ${subject} is sync, and ${call}, so the caller goes on before the work is done.${unsure} ` +
				"Make it async, or anchor the call whose caller has the answer when it returns."
		: `The ${subject} is async, and ${call}: its callee is synchronous, so the caller has the ` +
				`answer when the call returns.${unsure} Make it sync, or anchor the call that awaits or ` +
				"starts the work.";
}

/**
 * Whether a file was read through its grammar, which gives its calls.
 * @param facts The file's facts, if read.
 * @returns True for facts an adapter gave.
 */
function isSyntax(facts: FileFacts | undefined): facts is SyntaxFacts {
	return facts !== undefined && facts.adapter !== "text";
}

/**
 * The finding about a kind its anchored calls contradict, if they do.
 * @param claim The anchor.
 * @param kind The relationship's kind.
 * @param calls Its anchored calls in its file.
 * @param path The anchored file.
 * @returns The finding, or undefined where the calls agree or do not decide.
 */
function disagreement(
	claim: AnchorClaim,
	kind: string,
	calls: readonly AnchoredCall[],
	path: string,
): CodeFinding | undefined {
	const decided = callKindOf(calls.map((call) => call.timing));
	if (decided === undefined || decided === kind) return undefined;
	return {
		...claim.site,
		severity: "information",
		code: "CALL_TIMING_MISMATCH",
		message: messageOf(claim, kind, calls),
		evidence: calls.map((call) => evidenceOf(claim, path, call)),
	};
}

/**
 * The finding about a `sync` or `async` relationship whose anchored calls run otherwise, if any.
 * @param claim The anchor, with its relationship's kind.
 * @param facts The anchored file's facts.
 * @param search The pass's code facts and servers, and the checkout.
 * @returns The finding, or undefined where the kind agrees or the code does not decide.
 */
async function judgeCallTiming(
	claim: AnchorClaim,
	facts: FileFacts | undefined,
	search: CalleeSearch,
): Promise<CodeFinding | undefined> {
	const kind = claim.relationship?.kind ?? "";
	if (!TIMED_KINDS.has(kind) || !isSyntax(facts)) return undefined;
	const callee = calleeThroughServers(search, facts.path);
	const calls = await anchoredCalls(facts, claim.anchor.symbol, callee);
	return disagreement(claim, kind, calls, facts.path);
}

export { judgeCallTiming };
