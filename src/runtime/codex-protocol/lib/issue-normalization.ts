type IssuePath = readonly (string | number)[];
type IssueRecord = Record<string, unknown>;

/**
 * Narrows an unknown zod issue to a plain object so its fields can be read by key.
 * @param value - Any issue-like value.
 * @returns Whether the value is a non-array object.
 */
function isIssueRecord(value: unknown): value is IssueRecord {
	return !!value && typeof value === "object" && !Array.isArray(value);
}

/**
 * Reads an issue's own path, coercing symbol segments to text.
 * @param issue - Any issue-like value.
 * @returns The path segments, empty when the issue carries none.
 */
function issuePath(issue: unknown): IssuePath {
	if (!isIssueRecord(issue) || !Array.isArray(issue["path"])) {
		return [];
	}
	return issue["path"].map((segment) =>
		typeof segment === "string" || typeof segment === "number" ? segment : String(segment),
	);
}

/**
 * Extracts the per-branch issue lists from an invalid-union issue.
 * @param issue - The issue to inspect.
 * @returns One issue list per union branch, or undefined when the issue is not a union failure.
 */
function unionBranches(issue: IssueRecord): unknown[][] | undefined {
	if (issue["code"] !== "invalid_union" || !Array.isArray(issue["errors"])) {
		return undefined;
	}
	const branches: unknown[][] = [];
	for (const branch of issue["errors"]) {
		if (!Array.isArray(branch)) {
			return undefined;
		}
		branches.push(branch);
	}
	return branches;
}

/**
 * Walks a decoded payload down an issue path.
 * @param value - The root payload.
 * @param path - The path to follow.
 * @returns The value at that path, or undefined when the path leaves the payload.
 */
function valueAtPath(value: unknown, path: IssuePath): unknown {
	let current = value;
	for (const segment of path) {
		if (Array.isArray(current)) {
			const index = typeof segment === "number" ? segment : Number(segment);
			if (!Number.isInteger(index)) {
				return undefined;
			}
			current = current[index];
		} else if (isIssueRecord(current)) {
			current = current[String(segment)];
		} else {
			return undefined;
		}
	}
	return current;
}

/**
 * Collects every leaf path an issue reaches, descending through nested union branches.
 * @param issue - The issue to expand.
 * @param prefix - The path of the enclosing issue.
 * @returns Every absolute leaf path under the issue.
 */
function issuePaths(issue: unknown, prefix: IssuePath = []): IssuePath[] {
	if (!isIssueRecord(issue)) {
		return [prefix];
	}
	const path = [...prefix, ...issuePath(issue)];
	const branches = unionBranches(issue);
	if (!branches?.length) {
		return [path];
	}
	return branches.flatMap((branch) =>
		branch.length ? branch.flatMap((child) => issuePaths(child, path)) : [path],
	);
}

interface UnionBranchScore {
	readonly depth: number;
	readonly inputKeyMatches: number;
	readonly index: number;
}

/**
 * Scores how closely one union branch matched the input: deeper failures and more shared
 * top-level keys mean the branch is the one the payload was trying to be.
 * @param branch - The branch's issue list.
 * @param unionValue - The value the union was applied to.
 * @param index - The branch position, used as the final tie-breaker.
 * @returns The branch score.
 */
function branchScore(
	branch: readonly unknown[],
	unionValue: unknown,
	index: number,
): UnionBranchScore {
	const paths = branch.flatMap((issue) => issuePaths(issue));
	const depth = Math.max(0, ...paths.map((path) => path.length));
	const inputKeys = isIssueRecord(unionValue) ? new Set(Object.keys(unionValue)) : undefined;
	const inputKeyMatches = inputKeys
		? paths.reduce(
				(matches, path) =>
					matches + (path[0] !== undefined && inputKeys.has(String(path[0])) ? 1 : 0),
				0,
			)
		: 0;
	return { depth, inputKeyMatches, index };
}

/**
 * Orders two branch scores: depth first, then input-key matches, then the later branch.
 * @param candidate - The score being considered.
 * @param current - The best score so far.
 * @returns Whether the candidate should replace the current best.
 */
function isBetterBranch(candidate: UnionBranchScore, current: UnionBranchScore): boolean {
	if (candidate.depth !== current.depth) {
		return candidate.depth > current.depth;
	}
	if (candidate.inputKeyMatches !== current.inputKeyMatches) {
		return candidate.inputKeyMatches > current.inputKeyMatches;
	}
	return candidate.index > current.index;
}

/**
 * Picks the union branch whose failure best explains the input, so a decode error reports
 * one meaningful path instead of every branch's complaint.
 * @param branches - One issue list per branch.
 * @param unionValue - The value the union was applied to.
 * @returns The chosen branch's issues, or undefined when there are no branches.
 */
function deepestBranch(
	branches: readonly (readonly unknown[])[],
	unionValue: unknown,
): readonly unknown[] | undefined {
	let selected: readonly unknown[] | undefined;
	let selectedScore: UnionBranchScore | undefined;
	for (const [index, branch] of branches.entries()) {
		const score = branchScore(branch, unionValue, index);
		if (!selectedScore || isBetterBranch(score, selectedScore)) {
			selected = branch;
			selectedScore = score;
		}
	}
	return selected;
}

/**
 * Copies an issue with an absolute path in place of its relative one.
 * @param issue - The issue to copy.
 * @param path - The absolute path.
 * @returns The rewritten issue.
 */
function withIssuePath(issue: IssueRecord, path: IssuePath): IssueRecord {
	return { ...issue, path };
}

/**
 * Detects the one union that is deliberately left unflattened.
 * @param issue - The union issue.
 * @returns Whether the issue sits at a function-call output field.
 */
function isFunctionCallOutputBodyUnion(issue: IssueRecord): boolean {
	// FunctionCallOutputBodySchema is the one intentional regular union at an
	// output field; retain its containing issue for the documented exception.
	const path = issuePath(issue);
	return path[path.length - 1] === "output";
}

/**
 * Rewrites one issue to absolute paths and replaces a union failure with the issues of its
 * best-matching branch.
 * @param issue - The issue to normalize.
 * @param prefix - The path of the enclosing issue.
 * @param rootValue - The payload the schema was applied to.
 * @returns The normalized issues that replace it.
 */
function normalizeIssue(issue: unknown, prefix: IssuePath, rootValue: unknown): unknown[] {
	if (!isIssueRecord(issue)) {
		return [issue];
	}
	const path = [...prefix, ...issuePath(issue)];
	const branches = unionBranches(issue);
	if (!branches || isFunctionCallOutputBodyUnion(issue)) {
		return [withIssuePath(issue, path)];
	}
	const selected = deepestBranch(branches, valueAtPath(rootValue, path));
	if (!selected) {
		return [withIssuePath(issue, path)];
	}
	return selected.flatMap((child) => normalizeIssue(child, path, rootValue));
}

/**
 * Normalizes a zod issue list into absolute-path issues with union noise collapsed.
 * @param issues - The raw issues from a failed parse.
 * @param value - The payload the schema was applied to.
 * @returns The normalized issues.
 */
function normalizeIssues(issues: readonly unknown[], value: unknown): readonly unknown[] {
	return issues.flatMap((issue) => normalizeIssue(issue, [], value));
}

/**
 * Renders issues as `path: message` pairs for an error message.
 * @param issues - The issues to render.
 * @returns The rendered text, empty when there are no issues.
 */
function formatIssues(issues: readonly unknown[]): string {
	return issues
		.map((issue) => {
			if (!isIssueRecord(issue)) {
				return String(issue);
			}
			const path = Array.isArray(issue["path"]) ? issue["path"].join(".") : "payload";
			const message = typeof issue["message"] === "string" ? issue["message"] : "invalid value";
			return `${path}: ${message}`;
		})
		.join("; ");
}

export { formatIssues, normalizeIssues };
