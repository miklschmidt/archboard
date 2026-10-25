import path from "node:path";

import { CodeBindingSchema, type CodeBinding } from "@archboard/code-binding/bindings";
import { GitHubHttpsUrlSchema, type GitHubHttpsUrl } from "#shared/schemas/code-target-open.ts";

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
 * How GitHub shows a path: a file at a line as a blob with a fragment, anything else as a tree.
 * @param suffix - The encoded path tail, empty for the repository root, which is a directory.
 * @param line - The line to link to, if the caller found one.
 * @returns The view and the fragment to put in the URL.
 */
function githubPlace(
	suffix: string,
	line: number | undefined,
): { readonly view: "tree" | "blob"; readonly fragment: string } {
	return line === undefined || suffix === ""
		? { view: "tree", fragment: "" }
		: { view: "blob", fragment: `#L${line}` };
}

/**
 * Builds the GitHub URL a binding points at, pinned to its commit, else its
 * branch, else HEAD. It exists so a binding can still be opened when no local
 * checkout resolves, or when opening it fails. It names the file or directory,
 * and a file at a line when the caller found one, as `blob/<ref>/<path>#L<n>`.
 * A binding's `symbol` is looked up in a checkout's working tree (TASK-367.25),
 * never on GitHub, so the caller gives a line only where the checkout is not on
 * another ref than the binding pins.
 * @param binding - The binding to present.
 * @param line - The line to link to, found in a checkout's working tree.
 * @returns A validated GitHub URL, or undefined when the binding has none.
 */
function githubUrlForBinding(binding: CodeBinding, line?: number): GitHubHttpsUrl | undefined {
	const parsed = CodeBindingSchema.safeParse(binding);
	if (!parsed.success) {
		return undefined;
	}
	const parts = githubRepositoryParts(parsed.data.repo);
	const suffix = githubPathSuffix(parsed.data.path);
	if (parts === undefined || suffix === undefined) {
		return undefined;
	}
	const place = githubPlace(suffix, line);
	const target = `https://github.com/${encodeField(parts.owner)}/${encodeField(parts.repository)}/${place.view}/${encodeField(githubRef(parsed.data))}${suffix}${place.fragment}`;
	const validated = GitHubHttpsUrlSchema.safeParse(target);
	return validated.success ? validated.data : undefined;
}

export { githubUrlForBinding };
