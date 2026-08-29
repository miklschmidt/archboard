import { afterEach, beforeEach, expect, test } from "bun:test";
import fs from "node:fs";

import { resolveLocalCodeTargets } from "../index.ts";
import { resolveLocalCodeTargetsForDiagnostics, type ResolverDiagnostics } from "../diagnostics.ts";
import { repoIdentityAt, repoRootOf } from "../../engine/git.ts";
import { readRegistry } from "../../engine/repo-registry.ts";
import { createResolverFixture, type ResolverFixture } from "./support.ts";

let fixture: ResolverFixture;
let previousRegistry: string | undefined;

beforeEach(() => {
	fixture = createResolverFixture();
	previousRegistry = process.env.ARCHBOARD_REPOS;
	process.env.ARCHBOARD_REPOS = fixture.registry;
});

afterEach(() => {
	if (previousRegistry === undefined) delete process.env.ARCHBOARD_REPOS;
	else process.env.ARCHBOARD_REPOS = previousRegistry;
	fixture.dispose();
});

test("batch resolution returns one ordered result for every binding", () => {
	const bindings = [
		{ repo: fixture.repository, path: "src/index.ts" },
		{ repo: fixture.repository, path: "src/missing.ts" },
		{ repo: fixture.repository, path: "src/index.ts" },
		{ repo: fixture.repository, path: "src/nested" },
	] as const;
	const results = resolveLocalCodeTargets(bindings);
	expect(results).toHaveLength(4);
	expect(
		results.map((result) => (result.ok ? `${result.kind}:${result.path}` : result.code)),
	).toEqual([
		"file:src/index.ts",
		"TARGET_UNAVAILABLE",
		"file:src/index.ts",
		"directory:src/nested",
	]);
});

test("each batch validates repositories once and every target independently", () => {
	const counts = { registry: 0, root: 0, identity: 0, realpath: 0, stat: 0 };
	const diagnostics: ResolverDiagnostics = {
		readRegistry: () => {
			counts.registry++;
			return readRegistry();
		},
		realpath: (candidate) => {
			counts.realpath++;
			return fs.realpathSync.native(candidate);
		},
		stat: (candidate) => {
			counts.stat++;
			return fs.statSync(candidate);
		},
		repoRoot: (candidate) => {
			counts.root++;
			return repoRootOf(candidate);
		},
		repoIdentity: (candidate) => {
			counts.identity++;
			return repoIdentityAt(candidate);
		},
	};
	const bindings = [
		{ repo: fixture.repository, path: "src/index.ts" },
		{ repo: fixture.repository, path: "src/index.ts" },
		{ repo: "github.com/acme/missing", path: "src/index.ts" },
	] as const;

	resolveLocalCodeTargetsForDiagnostics(bindings, diagnostics);
	expect(counts).toEqual({ registry: 1, root: 1, identity: 1, realpath: 4, stat: 3 });
	resolveLocalCodeTargetsForDiagnostics(bindings, diagnostics);
	expect(counts).toEqual({ registry: 2, root: 2, identity: 2, realpath: 8, stat: 6 });
});
