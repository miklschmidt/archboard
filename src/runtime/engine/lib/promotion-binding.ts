import fs from "node:fs";
import path from "node:path";
import { inspectCheckout } from "../git.js";
import type { LogicalAddress } from "../metadata.js";
import { checkoutFor, knownRepoNames, rememberRepo } from "../repo-registry.js";
import { PromotionError } from "./promotion-identity.js";

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

function registeredHere(): string {
	const known = knownRepoNames();
	return known.length > 0
		? `Registered on this machine: ${known.join(", ")}.`
		: "No repository is registered on this machine yet.";
}

/**
 * Resolve a binding request into a logical address.
 *
 * Four ways a path can find its repository, in order of how firmly the caller
 * named it: an absolute path, a repository identity looked up in the checkout
 * registry, the caller's own working directory, or nothing at all. In that last
 * case the address is still recorded, because it is a statement about intent,
 * it just gets no link.
 *
 * Never throws for a path that does not resolve. It throws for a path that
 * *cannot* resolve by intent: a relative path on a surface with no working
 * directory, where any answer would be an accident.
 *
 * @param request - The logical or filesystem binding requested by the caller.
 * @param origin - The caller-declared origin for resolving relative paths.
 * @param options - Optional cancellation for git inspection.
 * @returns The portable logical address and how it was resolved.
 */
async function resolveBinding(
	request: BindingRequest,
	origin: BindingOrigin,
	options: { signal?: AbortSignal } = {},
): Promise<ResolvedBinding> {
	const confirmedAt = new Date().toISOString();
	const raw = request.path.trim();
	const named =
		typeof request.repo === "string" && request.repo.trim() ? request.repo.trim() : undefined;

	// The address exactly as the caller stated it: what gets recorded when this
	// machine has nothing to check it against.
	const asStated = (): LogicalAddress => ({
		...(named ? { repo: named } : {}),
		path: raw.replace(/^\.\//u, ""),
		...(request.branch ? { branch: request.branch } : {}),
		...(request.commit ? { commit: request.commit } : {}),
		confirmedAt,
	});

	let resolvedFrom: BindingSource;
	let baseDir: string;

	if (path.isAbsolute(raw)) {
		resolvedFrom = "path";
		baseDir = path.parse(raw).root;
	} else if (named) {
		const checkout = checkoutFor(named);
		if (!checkout) {
			return {
				address: asStated(),
				resolved: false,
				resolvedFrom: "declared",
				note:
					`"${named}" is not a checkout archboard knows on this machine, so ${raw} was recorded as you ` +
					`stated it, with no link. Register the checkout by running \`repo add <dir>\` inside it, or bind ` +
					`with an absolute path. ${registeredHere()}`,
			};
		}
		resolvedFrom = "registry";
		baseDir = checkout;
	} else if (origin.kind === "cwd") {
		resolvedFrom = "cwd";
		baseDir = origin.dir;
	} else {
		throw new PromotionError(
			`"${raw}" is a relative path and ${origin.surface} has no working directory to resolve it against. ` +
				"A client without a shell cannot set one, so the only directory available is whichever one this " +
				"process happened to be started in, which nobody chose (ADR 0011). Name what you mean instead: an " +
				'absolute path, or a repository plus a path inside it (repo "github.com/acme/payments", path ' +
				`"src/service.ts"). ${registeredHere()}`,
		);
	}

	const absolute = path.resolve(baseDir, raw);
	const checkout = await inspectCheckout(absolute, options);
	const exists = fs.existsSync(absolute);

	if (!checkout) {
		const where = resolvedFrom === "cwd" ? ` (looked in the working directory ${baseDir})` : "";
		return {
			address: asStated(),
			resolved: false,
			resolvedFrom,
			note: exists
				? `${raw} is not inside a git repository${where} — recorded the logical address without a repo identity, and no link.`
				: `${raw} does not resolve on this machine${where} — recorded the logical address as given, and no link.`,
		};
	}

	const { root, identity: found } = checkout;

	// A registry entry that now points at some other repository. The path just
	// resolved into the wrong checkout, so nothing here is trustworthy: say so
	// and record the address as stated rather than binding to the wrong file.
	if (resolvedFrom === "registry" && found !== named) {
		return {
			address: asStated(),
			resolved: false,
			resolvedFrom: "declared",
			note:
				`The checkout registered for "${named}" (${root}) is now ${found}, so ${raw} was recorded as you ` +
				`stated it, with no link. Re-register it with \`repo add <dir>\` from the right checkout.`,
		};
	}

	// What archboard just learned: this identity is checked out here. The
	// registry fills itself from ordinary work, so the next promotion into this
	// repo can name it from anywhere.
	rememberRepo(found, root);

	// The caller's own words still win over git's, because they may be recording
	// a binding for a repo this checkout is a fork or a mirror of. A disagreement
	// is still worth saying out loud.
	const repo = named ?? found;
	const relative = path.relative(root, absolute) || ".";
	const branch = request.branch ?? checkout.branch;
	const commit = request.commit ?? checkout.commit;

	const notes: string[] = [];
	if (resolvedFrom === "cwd") {
		notes.push(
			`Resolved "${raw}" against the working directory ${baseDir}, which is ${found}. ` +
				"You named no repository, so check that is the one you meant. --repo or an absolute path says it outright.",
		);
	}
	if (named && named !== found) {
		notes.push(
			`You said --repo ${named}, but ${absolute} is in ${found}. Recorded ${named}, as asked.`,
		);
	}
	if (!exists) {
		notes.push(`${relative} does not exist in ${repo} yet — address recorded, no link.`);
	}

	const address: LogicalAddress = {
		repo,
		path: relative,
		...(branch && branch !== "HEAD" ? { branch } : {}),
		...(commit ? { commit } : {}),
		confirmedAt,
	};

	return {
		address,
		resolved: true,
		resolvedFrom,
		...(notes.length > 0 ? { note: notes.join(" ") } : {}),
	};
}

function formatAddress(a: LogicalAddress): string {
	const repo = a.repo ? `${a.repo}:` : "";
	const branch = a.branch ? `@${a.branch}` : "";
	const commit = a.commit ? ` (${a.commit.slice(0, 7)})` : "";
	return `${repo}${a.path}${branch}${commit}`;
}

export { formatAddress, resolveBinding };
export type { BindingOrigin, BindingRequest, BindingSource, ResolvedBinding };
