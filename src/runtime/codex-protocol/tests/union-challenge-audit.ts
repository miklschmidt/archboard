import { expect } from "bun:test";

import type { ProtocolDecodeError } from "../index.js";
import type { NotificationUnionChallengeMutation } from "./union-challenge-utils.js";

type JsonPath = readonly string[];
type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
	return !!value && typeof value === "object" && !Array.isArray(value);
}

function issuePath(issue: unknown): string[] {
	if (!isRecord(issue) || !Array.isArray(issue["path"])) return [];
	return issue["path"].map((segment) => String(segment));
}

function nestedIssuePaths(issue: unknown, prefix: JsonPath = []): string[][] {
	if (!isRecord(issue)) return [];
	const path = [...prefix, ...issuePath(issue)];
	const nested = issue["errors"];
	if (!Array.isArray(nested)) return [path];
	return [
		path,
		...nested.flatMap((group) =>
			Array.isArray(group)
				? group.flatMap((child) => nestedIssuePaths(child, path))
				: nestedIssuePaths(group, path),
		),
	];
}

export function changedPaths(left: unknown, right: unknown, path: JsonPath = []): string[][] {
	if (Object.is(left, right)) return [];
	if (Array.isArray(left) && Array.isArray(right)) {
		const length = Math.max(left.length, right.length);
		return Array.from({ length }, (_, index) =>
			changedPaths(left[index], right[index], [...path, String(index)]),
		).flat();
	}
	if (isRecord(left) && isRecord(right)) {
		const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
		return [...keys].flatMap((key) => changedPaths(left[key], right[key], [...path, key]));
	}
	return [path as string[]];
}

export function pathKey(path: JsonPath): string {
	return path.join(".");
}

export function assertChallengeFailure(
	error: ProtocolDecodeError,
	mutation: NotificationUnionChallengeMutation,
) {
	expect(error.issues).toHaveLength(1);
	const directPath = issuePath(error.issues[0]);
	const targetPath = pathKey(mutation.targetPath);
	const allPaths = nestedIssuePaths(error.issues[0]).map(pathKey);
	const allowedContainingPaths = new Set(mutation.allowedContainingUnionPaths.map(pathKey));

	// Discriminated schemas report the replacement directly. These exact
	// containing paths cover the regular Zod union collapses in the fixtures.
	expect(allPaths).toContain(targetPath);
	const directKey = pathKey(directPath);
	if (allowedContainingPaths.has(directKey))
		expect(error.issues[0]).toMatchObject({ code: "invalid_union" });
	expect(directKey === targetPath || allowedContainingPaths.has(directKey)).toBe(true);
}
