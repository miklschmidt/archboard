// The code pass: every claim a board makes about code, held to the files on
// disk (ADR 0046).
//
// Each finding here says that something is missing, so the check is sure of
// it, the code contradicts the board, and a right change clears it: each one
// is a warning. A missing path or symbol is the only finding about its binding
// or anchor. What the pass cannot read is listed with the reason, and never
// reported as a finding.

import {
	createTextFiles,
	otherRefOf,
	readCheckouts,
	readableOf,
	type Checkout,
	type ReadCheckout,
	type TextFiles,
} from "@/runtime/code-check/lib/checkouts";
import {
	claimsOf,
	type AnchorClaim,
	type BindingClaim,
	type Claim,
	type ClaimSite,
} from "@/runtime/code-check/lib/claims";
import type { BoardToCheck } from "@/runtime/code-check/lib/boards";
import { textTest } from "@/runtime/code-check/lib/text-reading";
import {
	resolveLocalCodeTarget,
	snapshotCheckoutAccess,
	type CheckoutSnapshot,
} from "@/runtime/code-target/index";
import type { CodeCheckSkip, CodeFinding } from "@/shared/code-check/index";
import { describeSubject } from "@/shared/semantic-policy/index";

/** What one pass found and what it did not read. */
interface CodeCheckOutcome {
	readonly findings: CodeFinding[];
	readonly skipped: CodeCheckSkip[];
}

/** What judging one claim needs. */
interface Pass {
	readonly snapshot: CheckoutSnapshot;
	readonly checkouts: ReadonlyMap<string, Checkout>;
	readonly text: TextFiles;
	readonly outcome: CodeCheckOutcome;
}

/**
 * A warning about one claim.
 * @param site Where the claim sits.
 * @param code The finding's code.
 * @param message What is wrong and what to do.
 * @returns The finding.
 */
function warning(site: ClaimSite, code: string, message: string): CodeFinding {
	return { ...site, severity: "warning", code, message };
}

/**
 * A skipped subject, at its board and variant.
 * @param site Where the claim sits.
 * @param skip Why it was skipped, and what else the reason says.
 * @returns The skip.
 */
function skipped(
	site: ClaimSite,
	skip: Omit<CodeCheckSkip, "board" | "variant" | "subject">,
): CodeCheckSkip {
	return { board: site.board, variant: site.variant, subject: site.subject, ...skip };
}

/**
 * The repository a claim names.
 * @param claim The claim.
 * @returns Its repository.
 */
function repoOf(claim: Claim): string {
	return claim.kind === "binding" ? claim.binding.repo : claim.anchor.repo;
}

/**
 * The ref a claim's code is pinned to, when its checkout has another one out:
 * a binding's own pin, or the pin of a part at an anchor's end that binds the
 * anchor's repository, since the files on disk are then not that ref's.
 * @param claim The claim.
 * @param snapshot The registered checkouts.
 * @returns The two refs, and for an anchor the end that is pinned, or undefined.
 */
function pinOf(claim: Claim, snapshot: CheckoutSnapshot): Pick<CodeCheckSkip, "ref" | "detail"> {
	if (claim.kind === "binding") return { ref: otherRefOf(claim.binding, snapshot) };
	const pins = claim.ends.flatMap((end) => {
		const ref =
			end.binding?.repo === claim.anchor.repo ? otherRefOf(end.binding, snapshot) : undefined;
		return ref === undefined ? [] : [{ ref, detail: `${end.name} is pinned to ${ref.named}` }];
	});
	return pins[0] ?? {};
}

/**
 * The checkout a claim reads, or the skip that says why it reads none. A
 * checkout that is unavailable is said once for the whole checkout, so its
 * claims add nothing.
 * @param claim The claim.
 * @param pass The pass.
 * @returns The checkout's root and files, or undefined when the claim is not read.
 */
function checkoutFor(claim: Claim, pass: Pass): ReadCheckout | undefined {
	const repo = repoOf(claim);
	const checkout = pass.checkouts.get(repo);
	if (checkout?.status === "unregistered") {
		pass.outcome.skipped.push(skipped(claim.site, { reason: "repository-unregistered", repo }));
	}
	if (checkout?.status !== "read") return undefined;
	const pin = pinOf(claim, pass.snapshot);
	if (pin.ref === undefined) return checkout;
	pass.outcome.skipped.push(skipped(claim.site, { reason: "ref-not-checked-out", repo, ...pin }));
	return undefined;
}

/**
 * Whether the files of a path hold a symbol's name, or why they cannot be read.
 * @param claim The claim, for its skip.
 * @param readable What the pass may read of the path.
 * @param checkout The checkout it is in.
 * @param symbol The symbol.
 * @param pass The pass.
 * @returns Whether a file holds it, or undefined when the path is skipped.
 */
function holdsSymbol(
	claim: Claim,
	readable: ReturnType<typeof readableOf>,
	checkout: ReadCheckout,
	symbol: string,
	pass: Pass,
): boolean | undefined {
	if (readable.status !== "files") {
		const reason = readable.status === "ignored" ? "path-ignored" : "path-never-read";
		const at = claim.kind === "binding" ? claim.binding.path : claim.anchor.path;
		pass.outcome.skipped.push(skipped(claim.site, { reason, repo: repoOf(claim), detail: at }));
		return undefined;
	}
	const test = textTest(symbol);
	return readable.files.some((file) => test.holds(pass.text.read(checkout, file) ?? ""));
}

/**
 * The warning for a bound path that a named draft names and the checkout lacks.
 * @param claim The binding.
 * @param root The checkout.
 * @returns The finding.
 */
function bindingPathMissing(claim: BindingClaim, root: string): CodeFinding {
	const { binding, site } = claim;
	return warning(
		site,
		"BINDING_PATH_MISSING",
		`Node ${JSON.stringify(site.subject.name)} is bound to ${JSON.stringify(binding.path)} in ` +
			`${JSON.stringify(binding.repo)} on the named draft, and there is no such file or ` +
			`directory in the checkout at ${JSON.stringify(root)}. Naming a draft says that its code ` +
			"is built now: bind the part to where its code lives, write that code, or leave --variant " +
			"out until it is built.",
	);
}

/**
 * The warning for a bound symbol that the bound file or directory does not hold.
 * @param claim The binding.
 * @param symbol Its symbol.
 * @param kind Whether it binds a file or a directory.
 * @returns The finding.
 */
function bindingSymbolMissing(
	claim: BindingClaim,
	symbol: string,
	kind: "file" | "directory",
): CodeFinding {
	const { binding, site } = claim;
	const where = kind === "file" ? "the file does not hold" : "no file below the directory holds";
	return warning(
		site,
		"BINDING_SYMBOL_MISSING",
		`Node ${JSON.stringify(site.subject.name)} is bound to ${JSON.stringify(symbol)} in ` +
			`${JSON.stringify(binding.path)}, and ${where} the name ` +
			`${JSON.stringify(textTest(symbol).name)}. Bind the part to the definition it stands for ` +
			"now, or leave out the symbol to bind the whole file or directory.",
	);
}

/**
 * Judge a part's binding: on a named draft that its path is in the checkout,
 * and that the bound file or directory holds its symbol. On the current variant
 * a missing path is the plain check's to report, so the pass says nothing more.
 * @param claim The binding.
 * @param pass The pass.
 */
function judgeBinding(claim: BindingClaim, pass: Pass): void {
	const checkout = checkoutFor(claim, pass);
	if (checkout === undefined) return;
	const target = resolveLocalCodeTarget(claim.binding, pass.snapshot);
	if (!target.ok) {
		if (claim.path) pass.outcome.findings.push(bindingPathMissing(claim, checkout.root));
		return;
	}
	const { symbol } = claim.binding;
	if (symbol === undefined) return;
	const readable = readableOf(target, checkout.files);
	if (holdsSymbol(claim, readable, checkout, symbol, pass) === false) {
		pass.outcome.findings.push(bindingSymbolMissing(claim, symbol, target.kind));
	}
}

/**
 * The warning for an anchor whose file is not in the checkout.
 * @param claim The anchor.
 * @param root The checkout.
 * @returns The finding.
 */
function anchorPathMissing(claim: AnchorClaim, root: string): CodeFinding {
	const { anchor, site } = claim;
	return warning(
		site,
		"ANCHOR_PATH_MISSING",
		`The anchor of ${describeSubject(site.subject)} names ${JSON.stringify(anchor.path)} in ` +
			`${JSON.stringify(anchor.repo)}, and there is no such file in the checkout at ` +
			`${JSON.stringify(root)}. Cite the file that holds the code now, or remove the anchor if ` +
			"the code that proved it is gone.",
	);
}

/**
 * The warning for an anchor whose file does not hold its symbol.
 * @param claim The anchor.
 * @returns The finding.
 */
function anchorSymbolMissing(claim: AnchorClaim): CodeFinding {
	const { anchor, site } = claim;
	return warning(
		site,
		"ANCHOR_SYMBOL_MISSING",
		`The anchor of ${describeSubject(site.subject)} names ${JSON.stringify(anchor.symbol)} in ` +
			`${JSON.stringify(anchor.path)}, and the file does not hold the name ` +
			`${JSON.stringify(textTest(anchor.symbol).name)}. Cite the symbol that proves it now, or ` +
			"change the board to what the code does.",
	);
}

/**
 * Judge an anchor: its file is in the checkout and holds its symbol.
 * @param claim The anchor.
 * @param pass The pass.
 */
function judgeAnchor(claim: AnchorClaim, pass: Pass): void {
	const checkout = checkoutFor(claim, pass);
	if (checkout === undefined) return;
	const { repo, path, symbol } = claim.anchor;
	const target = resolveLocalCodeTarget({ repo, path }, pass.snapshot);
	if (!target.ok || target.kind !== "file") {
		pass.outcome.findings.push(anchorPathMissing(claim, checkout.root));
		return;
	}
	const readable = readableOf(target, checkout.files);
	if (holdsSymbol(claim, readable, checkout, symbol, pass) === false) {
		pass.outcome.findings.push(anchorSymbolMissing(claim));
	}
}

/**
 * What the pass says once for each checkout: that it is unavailable, or that
 * it was read only as text, so nothing that needs references was judged.
 * @param checkouts Each repository's checkout.
 * @returns One skip for each registered checkout.
 */
function checkoutSkips(checkouts: ReadonlyMap<string, Checkout>): CodeCheckSkip[] {
	return [...checkouts].flatMap(([repo, checkout]): CodeCheckSkip[] => {
		if (checkout.status === "unavailable") {
			return [{ reason: "checkout-unavailable", repo, detail: checkout.detail }];
		}
		if (checkout.status === "unregistered") return [];
		return [
			{
				reason: "text-only",
				repo,
				detail:
					"Read as text: its anchors and bound symbols were judged, and nothing that needs references.",
			},
		];
	});
}

/**
 * Hold every board's anchors and bound symbols to the files on disk.
 * @param boards The boards, each at the variant the check reads.
 * @param signal Cancels the pass and every Git command it runs.
 * @returns The findings and what the pass did not read.
 */
async function checkCode(
	boards: readonly BoardToCheck[],
	signal: AbortSignal,
): Promise<CodeCheckOutcome> {
	const claims = boards.flatMap(claimsOf);
	const snapshot = await snapshotCheckoutAccess({
		signal,
		bindings: claims.map((claim) =>
			claim.kind === "binding"
				? claim.binding
				: { repo: claim.anchor.repo, path: claim.anchor.path },
		),
	});
	const checkouts = await readCheckouts(claims.map(repoOf), snapshot, signal);
	const pass: Pass = {
		snapshot,
		checkouts,
		text: createTextFiles(),
		outcome: { findings: [], skipped: [] },
	};
	for (const claim of claims) {
		if (claim.kind === "binding") judgeBinding(claim, pass);
		else judgeAnchor(claim, pass);
	}
	pass.outcome.skipped.push(...checkoutSkips(checkouts));
	return pass.outcome;
}

export { type CodeCheckOutcome, checkCode };
