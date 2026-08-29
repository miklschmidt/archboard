import path from "node:path";

import {
	buildInternalCodeTargetUrl,
	CodeBindingSchema,
	GitHubHttpsUrlSchema,
	type CodeBinding,
	type CodeTargetOpenRequest,
	type GitHubHttpsUrl,
} from "../../shared/code-target/index.js";
import type { LocalCodeTargetResult } from "./index.js";

function encodeField(value: string): string {
	return encodeURIComponent(value);
}

export function githubUrlForBinding(binding: CodeBinding): GitHubHttpsUrl | undefined {
	const parsed = CodeBindingSchema.safeParse(binding);
	if (!parsed.success) return undefined;
	const [host, owner, repository, ...extra] = parsed.data.repo.split("/");
	if (host !== "github.com" || !owner || !repository || extra.length > 0) return undefined;
	const ref = parsed.data.commit ?? parsed.data.branch ?? "HEAD";
	let suffix = "";
	if (parsed.data.path !== "" && parsed.data.path !== ".") {
		const candidate = parsed.data.path;
		if (
			path.posix.isAbsolute(candidate) ||
			path.win32.isAbsolute(candidate) ||
			candidate.includes("\\")
		)
			return undefined;
		const segments = candidate.split("/");
		if (segments.some((segment) => segment === "" || segment === "." || segment === ".."))
			return undefined;
		suffix = `/${segments.map(encodeField).join("/")}`;
	}
	const target = `https://github.com/${encodeField(owner)}/${encodeField(repository)}/tree/${encodeField(ref)}${suffix}`;
	const validated = GitHubHttpsUrlSchema.safeParse(target);
	return validated.success ? validated.data : undefined;
}

export function presentationTargetForBinding(
	binding: CodeBinding,
	identity: CodeTargetOpenRequest,
	local: LocalCodeTargetResult,
): string | undefined {
	return local.ok ? buildInternalCodeTargetUrl(identity) : githubUrlForBinding(binding);
}
