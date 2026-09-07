import fs from "node:fs";
import path from "node:path";
import { inspectCheckout } from "@/runtime/engine/git";
import type { LogicalAddress } from "@/runtime/engine/metadata";
import { checkoutFor, knownRepoNames, rememberRepo } from "@/runtime/engine/repo-registry";
import { PromotionError } from "@/runtime/engine/lib/promotion-identity";

// ---------------------------------------------------------------------------
// Binding — a logical address, not a machine path
// ---------------------------------------------------------------------------
//
// The vault spans repositories and is not co-located with any of them (ADR
// 0004), so a binding names code as repo identity + path, plus the branch and
// commit at which it was last confirmed — that pair is what lets git history
// trace a file that later moves. Machine-specific code targets are presentation.

interface BindingRequest {
	path: string;
	repo?: string;
	branch?: string;
	commit?: string;
}

type BindingSource =
	// The caller gave an absolute path.
	| "path"
	// The caller named a repository, and it is checked out here.
	| "registry"
	// Resolved against the caller's working directory.
	| "cwd"
	// Recorded as stated; nothing on this machine can resolve it.
	| "declared";

/**
 * Where a *relative* path is allowed to resolve from.
 *
 * There is no default, and that is the whole decision (ADR 0011). A surface
 * with a shell has a working directory the caller chose and can see, so it says
 * so. A caller without one says that instead, and a relative path is refused
 * rather than resolved against the server process's ambient directory.
 */
type BindingOrigin = { kind: "cwd"; dir: string } | { kind: "none"; surface: string };

interface ResolvedBinding {
	address: LogicalAddress;
	// Whether resolution found a real repository.
	resolved: boolean;
	// What the address resolved against, always reported.
	resolvedFrom: BindingSource;
	// Said aloud when the answer is not simply what the caller named.
	note?: string;
}

/** What a checkout says about itself, when there is one at the path. */
type Checkout = NonNullable<Awaited<ReturnType<typeof inspectCheckout>>>;

/** How a caller cancels the git inspection. */
interface ResolveOptions {
	signal?: AbortSignal;
}

/** The request, tidied, with the moment this resolution was made. */
interface StatedBinding {
	request: BindingRequest;
	/** The path with its surrounding whitespace gone. */
	raw: string;
	/** The repository the caller named, when it named one. */
	named: string | undefined;
	confirmedAt: string;
}

/** Where a relative path resolves from, once that has been decided. */
interface ResolutionBase {
	resolvedFrom: BindingSource;
	baseDir: string;
}

/**
 * Which repositories this machine can resolve, for a message that has to say
 * why one could not be.
 * @returns The sentence.
 */
function registeredHere(): string {
	const known = knownRepoNames();
	return known.length > 0
		? `Registered on this machine: ${known.join(", ")}.`
		: "No repository is registered on this machine yet.";
}

/**
 * The request, tidied into the form the rest of this resolution reads.
 * @param request What the caller asked for.
 * @returns The stated binding.
 */
function statedBindingOf(request: BindingRequest): StatedBinding {
	const named =
		typeof request.repo === "string" && request.repo.trim() ? request.repo.trim() : undefined;
	return {
		request,
		raw: request.path.trim(),
		named,
		confirmedAt: new Date().toISOString(),
	};
}

/**
 * The address exactly as the caller stated it: what gets recorded when this
 * machine has nothing to check it against.
 * @param stated The tidied request.
 * @returns The address.
 */
function statedAddress(stated: StatedBinding): LogicalAddress {
	const { request, named, raw, confirmedAt } = stated;
	return {
		...(named ? { repo: named } : {}),
		path: raw.replace(/^\.\//u, ""),
		...(request.branch ? { branch: request.branch } : {}),
		...(request.commit ? { commit: request.commit } : {}),
		confirmedAt,
	};
}

/**
 * The answer for a repository this machine has no checkout of: the address is
 * recorded as stated, because it is still a statement about intent.
 * @param stated The tidied request.
 * @param named The repository the caller named.
 * @returns The binding.
 */
function unregisteredRepo(stated: StatedBinding, named: string): ResolvedBinding {
	return {
		address: statedAddress(stated),
		resolved: false,
		resolvedFrom: "declared",
		note:
			`"${named}" is not a checkout archboard knows on this machine, so ${stated.raw} was recorded as you ` +
			`stated it, with no link. Register the checkout by running \`repo add <dir>\` inside it, or bind ` +
			`with an absolute path. ${registeredHere()}`,
	};
}

/**
 * The refusal for a relative path nobody chose a directory for.
 * @param raw The path as stated.
 * @param surface Which caller had no working directory.
 * @returns The error to throw.
 */
function relativePathRefusal(raw: string, surface: string): PromotionError {
	return new PromotionError(
		`"${raw}" is a relative path and ${surface} has no working directory to resolve it against. ` +
			"A client without a shell cannot set one, so the only directory available is whichever one this " +
			"process happened to be started in, which nobody chose (ADR 0011). Name what you mean instead: an " +
			'absolute path, or a repository plus a path inside it (repo "github.com/acme/payments", path ' +
			`"src/service.ts"). ${registeredHere()}`,
	);
}

/**
 * Where this path resolves from.
 *
 * Four ways a path can find its repository, in order of how firmly the caller
 * named it: an absolute path, a repository identity looked up in the checkout
 * registry, the caller's own working directory, or nothing at all.
 * @param stated The tidied request.
 * @param origin Where a relative path is allowed to resolve from.
 * @returns The base to resolve against, or the finished answer for a
 * repository this machine cannot find.
 * @throws {PromotionError} For a relative path on a surface with no working
 * directory, where any answer would be an accident.
 */
function resolutionBase(
	stated: StatedBinding,
	origin: BindingOrigin,
): ResolutionBase | ResolvedBinding {
	const { raw, named } = stated;
	if (path.isAbsolute(raw)) {
		return { resolvedFrom: "path", baseDir: path.parse(raw).root };
	}
	if (named) {
		const checkout = checkoutFor(named);
		return checkout
			? { resolvedFrom: "registry", baseDir: checkout }
			: unregisteredRepo(stated, named);
	}
	if (origin.kind === "cwd") {
		return { resolvedFrom: "cwd", baseDir: origin.dir };
	}
	throw relativePathRefusal(raw, origin.surface);
}

/**
 * The answer for a path that resolved to no repository at all.
 * @param stated The tidied request.
 * @param base Where it resolved from.
 * @param exists Whether anything is actually at the path.
 * @returns The binding, recorded as stated and with no link.
 */
function unresolvedBinding(
	stated: StatedBinding,
	base: ResolutionBase,
	exists: boolean,
): ResolvedBinding {
	const where =
		base.resolvedFrom === "cwd" ? ` (looked in the working directory ${base.baseDir})` : "";
	return {
		address: statedAddress(stated),
		resolved: false,
		resolvedFrom: base.resolvedFrom,
		note: exists
			? `${stated.raw} is not inside a git repository${where} — recorded the logical address without a repo identity, and no link.`
			: `${stated.raw} does not resolve on this machine${where} — recorded the logical address as given, and no link.`,
	};
}

/**
 * The answer for a registry entry that now points at some other repository.
 *
 * The path just resolved into the wrong checkout, so nothing here is
 * trustworthy: say so and record the address as stated rather than binding to
 * the wrong file.
 * @param stated The tidied request.
 * @param root Where the registered checkout is.
 * @param found What git says that checkout actually is.
 * @returns The binding.
 */
function wrongCheckout(stated: StatedBinding, root: string, found: string): ResolvedBinding {
	return {
		address: statedAddress(stated),
		resolved: false,
		resolvedFrom: "declared",
		note:
			`The checkout registered for "${stated.named}" (${root}) is now ${found}, so ${stated.raw} was recorded as you ` +
			`stated it, with no link. Re-register it with \`repo add <dir>\` from the right checkout.`,
	};
}

/** Everything a resolution's spoken notes are drawn from. */
interface ResolutionFacts {
	stated: StatedBinding;
	base: ResolutionBase;
	/** What git says the checkout is. */
	found: string;
	absolute: string;
	relative: string;
	repo: string;
	exists: boolean;
}

/**
 * What is worth saying out loud about a resolution that succeeded.
 * @param facts The resolution.
 * @returns The notes, which may be none.
 */
function resolutionNotes(facts: ResolutionFacts): string[] {
	const { stated, base, found, absolute, relative, repo, exists } = facts;
	const notes: string[] = [];
	if (base.resolvedFrom === "cwd") {
		notes.push(
			`Resolved "${stated.raw}" against the working directory ${base.baseDir}, which is ${found}. ` +
				"You named no repository, so check that is the one you meant. --repo or an absolute path says it outright.",
		);
	}
	if (stated.named && stated.named !== found) {
		notes.push(
			`You said --repo ${stated.named}, but ${absolute} is in ${found}. Recorded ${stated.named}, as asked.`,
		);
	}
	if (!exists) {
		notes.push(`${relative} does not exist in ${repo} yet — address recorded, no link.`);
	}
	return notes;
}

/**
 * The branch a binding was confirmed against.
 *
 * A detached HEAD names no branch, and recording "HEAD" would claim one.
 * @param request What the caller asked for.
 * @param checkout What git says.
 * @returns The `branch` field, or nothing.
 */
function confirmedBranch(request: BindingRequest, checkout: Checkout): { branch?: string } {
	const branch = request.branch ?? checkout.branch;
	return branch && branch !== "HEAD" ? { branch } : {};
}

/**
 * The commit a binding was confirmed against, which is what lets git history
 * trace a file that later moves.
 * @param request What the caller asked for.
 * @param checkout What git says.
 * @returns The `commit` field, or nothing.
 */
function confirmedCommit(request: BindingRequest, checkout: Checkout): { commit?: string } {
	const commit = request.commit ?? checkout.commit;
	return commit ? { commit } : {};
}

/**
 * The answer for a path that resolved into a real checkout.
 * @param stated The tidied request.
 * @param base Where it resolved from.
 * @param checkout What git says about that checkout.
 * @param absolute The path on this machine.
 * @param exists Whether anything is actually there.
 * @returns The binding.
 */
function bindingForCheckout(
	stated: StatedBinding,
	base: ResolutionBase,
	checkout: Checkout,
	absolute: string,
	exists: boolean,
): ResolvedBinding {
	const { root, identity: found } = checkout;
	if (base.resolvedFrom === "registry" && found !== stated.named) {
		return wrongCheckout(stated, root, found);
	}
	// What archboard just learned: this identity is checked out here. The
	// registry fills itself from ordinary work, so the next promotion into this
	// repo can name it from anywhere.
	rememberRepo(found, root);
	// The caller's own words still win over git's, because they may be recording
	// a binding for a repo this checkout is a fork or a mirror of. A disagreement
	// is still worth saying out loud.
	const repo = stated.named ?? found;
	const relative = path.relative(root, absolute) || ".";
	const notes = resolutionNotes({ stated, base, found, absolute, relative, repo, exists });
	return {
		address: {
			repo,
			path: relative,
			...confirmedBranch(stated.request, checkout),
			...confirmedCommit(stated.request, checkout),
			confirmedAt: stated.confirmedAt,
		},
		resolved: true,
		resolvedFrom: base.resolvedFrom,
		...(notes.length > 0 ? { note: notes.join(" ") } : {}),
	};
}

/**
 * Resolve a binding request into a logical address.
 *
 * Never throws for a path that does not resolve: the address is still
 * recorded, because it is a statement about intent, it just gets no link. It
 * throws only for a path that *cannot* resolve by intent, which is a relative
 * path on a surface with no working directory.
 * @param request The logical or filesystem binding requested by the caller.
 * @param origin The caller-declared origin for resolving relative paths.
 * @param options Optional cancellation for git inspection.
 * @returns The portable logical address and how it was resolved.
 * @throws {PromotionError} When a relative path has no directory anybody chose
 * to resolve it against.
 */
async function resolveBinding(
	request: BindingRequest,
	origin: BindingOrigin,
	options: ResolveOptions = {},
): Promise<ResolvedBinding> {
	const stated = statedBindingOf(request);
	const base = resolutionBase(stated, origin);
	if (!("baseDir" in base)) {
		return base;
	}
	const absolute = path.resolve(base.baseDir, stated.raw);
	const checkout = await inspectCheckout(absolute, options);
	const exists = fs.existsSync(absolute);
	if (!checkout) {
		return unresolvedBinding(stated, base, exists);
	}
	return bindingForCheckout(stated, base, checkout, absolute, exists);
}

/**
 * A binding as a reader sees it: the repository, the path, and the branch and
 * commit it was last confirmed at.
 * @param a The address.
 * @returns The text.
 */
function formatAddress(a: LogicalAddress): string {
	const repo = a.repo ? `${a.repo}:` : "";
	const branch = a.branch ? `@${a.branch}` : "";
	const commit = a.commit ? ` (${a.commit.slice(0, 7)})` : "";
	return `${repo}${a.path}${branch}${commit}`;
}

export { formatAddress, resolveBinding };
export type { BindingOrigin, BindingRequest, BindingSource, ResolvedBinding };
