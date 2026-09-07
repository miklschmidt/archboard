import path from "node:path";

import {
	buildInternalCodeTargetUrl,
	CodeBindingSchema,
	GitHubHttpsUrlSchema,
	type CodeBinding,
	type CodeTargetOpenRequest,
	type GitHubHttpsUrl,
} from "@/shared/code-target";
import type { LocalCodeTargetResult } from "@/runtime/code-target";

/**
 * Percent-encodes one URL path segment.
 * @param value - The raw segment.
 * @returns The encoded segment.
 */
function encodeField(value: string): string {
	return encodeURIComponent(value);
}

/**
 * Splits a binding's repository into the GitHub owner and repository names,
 * which is only possible for a two-segment github.com repository.
 * @param repo - The binding's `host/owner/repository` string.
 * @returns The owner and repository, or undefined when the repo is not on GitHub.
 */
function githubRepositoryParts(
	repo: string,
): { readonly owner: string; readonly repository: string } | undefined {
	const [host, owner, repository, ...extra] = repo.split("/");
	if (host !== "github.com" || !owner || !repository || extra.length > 0) {
		return undefined;
	}
	return { owner, repository };
}

/**
 * Detects a path that is absolute on any platform or uses Windows separators;
 * neither can be appended to a GitHub tree URL.
 * @param candidate - The binding path.
 * @returns True when the path cannot be a repository-relative URL tail.
 */
function isAbsoluteOrWindowsPath(candidate: string): boolean {
	return (
		path.posix.isAbsolute(candidate) || path.win32.isAbsolute(candidate) || candidate.includes("\\")
	);
}

/**
 * Turns a repository-relative binding path into the encoded tail of a GitHub
 * tree URL. An absolute, Windows-style or traversing path has no safe URL.
 * @param candidate - The binding path.
 * @returns The URL suffix (empty for the repository root), or undefined when unsafe.
 */
function githubPathSuffix(candidate: string): string | undefined {
	if (candidate === "" || candidate === ".") {
		return "";
	}
	if (isAbsoluteOrWindowsPath(candidate)) {
		return undefined;
	}
	const segments = candidate.split("/");
	if (segments.some((segment) => segment === "" || segment === "." || segment === "..")) {
		return undefined;
	}
	return `/${segments.map(encodeField).join("/")}`;
}

/**
 * Picks the Git ref a binding is pinned to: its commit, else its branch, else HEAD.
 * @param binding - The validated binding.
 * @returns The ref to put in the tree URL.
 */
function githubRef(binding: CodeBinding): string {
	return binding.commit ?? binding.branch ?? "HEAD";
}

/**
 * Builds the GitHub tree URL a binding points at, pinned to its commit, else
 * its branch, else HEAD. It exists so a binding can still be opened when no
 * local checkout resolves.
 * @param binding - The binding to present.
 * @returns A validated GitHub URL, or undefined when the binding has none.
 */
function githubUrlForBinding(binding: CodeBinding): GitHubHttpsUrl | undefined {
	const parsed = CodeBindingSchema.safeParse(binding);
	if (!parsed.success) {
		return undefined;
	}
	const parts = githubRepositoryParts(parsed.data.repo);
	const suffix = githubPathSuffix(parsed.data.path);
	if (parts === undefined || suffix === undefined) {
		return undefined;
	}
	const target = `https://github.com/${encodeField(parts.owner)}/${encodeField(parts.repository)}/tree/${encodeField(githubRef(parsed.data))}${suffix}`;
	const validated = GitHubHttpsUrlSchema.safeParse(target);
	return validated.success ? validated.data : undefined;
}

/**
 * Chooses the URL a card opens: the internal opener when the target resolved
 * locally, otherwise the GitHub fallback.
 * @param binding - The binding to present.
 * @param identity - The open request the internal opener answers.
 * @param local - The local resolution outcome for the binding.
 * @returns The URL to open, or undefined when neither surface can show it.
 */
function presentationTargetForBinding(
	binding: CodeBinding,
	identity: CodeTargetOpenRequest,
	local: LocalCodeTargetResult,
): string | undefined {
	return local.ok ? buildInternalCodeTargetUrl(identity) : githubUrlForBinding(binding);
}

export { githubUrlForBinding, presentationTargetForBinding };
