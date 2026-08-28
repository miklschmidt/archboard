import { describe, expect, test } from "bun:test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import {
	RepoAddResultSchema,
	RepoForgetResultSchema,
	RepoListJsonResultSchema,
} from "../../../src/cli/commands/repo.ts";
import { createRepositoryFixture, repositoryFailure } from "./support/repository-fixture.ts";

const alphaIdentity = "github.com/acme/alpha";
const betaIdentity = "github.com/acme/beta";
describe("repository registry package behavior", () => {
	test("adds, lists, and forgets an isolated checkout", () => {
		using fixture = createRepositoryFixture();
		const alpha = fixture.repository("alpha", "git@github.com:acme/alpha.git");
		const added = fixture.run(["repo", "add", alpha]);
		let diagnostic = repositoryFailure(added);
		expect(added.status, diagnostic).toBe(0);
		expect(added.signal, diagnostic).toBeNull();
		expect(RepoAddResultSchema.parse(JSON.parse(added.stdout)), diagnostic).toMatchObject({
			repo: alphaIdentity,
			root: alpha,
		});
		const listed = fixture.run(["repo", "list"]);
		diagnostic = repositoryFailure(listed);
		expect(listed.status, diagnostic).toBe(0);
		expect(RepoListJsonResultSchema.parse(JSON.parse(listed.stdout)).repos, diagnostic).toEqual([
			expect.objectContaining({ repo: alphaIdentity, root: alpha, source: "declared" }),
		]);
		const forgotten = fixture.run(["repo", "forget", alphaIdentity]);
		diagnostic = repositoryFailure(forgotten);
		expect(forgotten.status, diagnostic).toBe(0);
		expect(RepoForgetResultSchema.parse(JSON.parse(forgotten.stdout)), diagnostic).toBeDefined();
		const empty = fixture.run(["repo", "list"]);
		diagnostic = repositoryFailure(empty);
		expect(empty.status, diagnostic).toBe(0);
		expect(RepoListJsonResultSchema.parse(JSON.parse(empty.stdout)).repos, diagnostic).toEqual([]);
	});

	test("refuses a directory that is not a repository", () => {
		using fixture = createRepositoryFixture();
		const result = fixture.run(["repo", "add", fixture.nowhere]);
		const diagnostic = repositoryFailure(result);
		expect(result.status, diagnostic).not.toBe(0);
		expect(result.stdout, diagnostic).toBe("");
		expect(result.stderr, diagnostic).toContain("not inside a git repository");
	});
});

describe("repository binding resolution", () => {
	test("resolves absolute, named, and ambient paths in declared order", async () => {
		using fixture = createRepositoryFixture();
		const previous = process.env.ARCHBOARD_REPOS;
		process.env.ARCHBOARD_REPOS = fixture.registry;
		try {
			const alpha = fixture.repository("alpha", "git@github.com:acme/alpha.git");
			const beta = fixture.repository("beta", "https://github.com/acme/beta.git");
			const { resolveBinding } = await import("../../../src/runtime/engine/promote.ts");
			const { declareRepo, checkoutFor, listRepos } =
				await import("../../../src/runtime/engine/repo-registry.ts");
			declareRepo(alpha);
			const absolute = resolveBinding(
				{ path: join(beta, "src/service.ts") },
				{ kind: "none", surface: "this caller" },
			);
			expect(absolute).toMatchObject({
				resolved: true,
				resolvedFrom: "path",
				address: { repo: betaIdentity, path: "src/service.ts", branch: "main" },
			});
			expect(absolute.address.commit).toMatch(/^[0-9a-f]{40}$/);
			expect(checkoutFor(betaIdentity)).toBe(beta);
			expect(listRepos().find((entry) => entry.repo === betaIdentity)?.source).toBe("observed");
			const named = resolveBinding(
				{ path: "src/service.ts", repo: betaIdentity },
				{ kind: "none", surface: "this caller" },
			);
			expect(named).toMatchObject({ resolved: true, resolvedFrom: "registry" });
			expect(named.link).toBe(`file://${beta}/src/service.ts`);
			const ambient = resolveBinding({ path: "src/service.ts" }, { kind: "cwd", dir: alpha });
			expect(ambient).toMatchObject({
				resolved: true,
				resolvedFrom: "cwd",
				address: { repo: alphaIdentity },
			});
			expect(ambient.note).toContain("You named no repository");
		} finally {
			if (previous === undefined) delete process.env.ARCHBOARD_REPOS;
			else process.env.ARCHBOARD_REPOS = previous;
		}
	});

	test("retains portable intent when a checkout is unknown", async () => {
		using fixture = createRepositoryFixture();
		const previous = process.env.ARCHBOARD_REPOS;
		process.env.ARCHBOARD_REPOS = fixture.registry;
		try {
			const { resolveBinding } = await import("../../../src/runtime/engine/promote.ts");
			const unknown = resolveBinding(
				{ path: "src/service.ts", repo: "github.com/acme/never-cloned" },
				{ kind: "none", surface: "this caller" },
			);
			expect(unknown).toMatchObject({
				resolved: false,
				address: { repo: "github.com/acme/never-cloned", path: "src/service.ts" },
			});
			expect(unknown.link).toBeUndefined();
			expect(unknown.note).toContain("repo add");
		} finally {
			if (previous === undefined) delete process.env.ARCHBOARD_REPOS;
			else process.env.ARCHBOARD_REPOS = previous;
		}
	});

	test("refuses a stale checkout instead of falling back to the wrong repository", async () => {
		using fixture = createRepositoryFixture();
		const previous = process.env.ARCHBOARD_REPOS;
		process.env.ARCHBOARD_REPOS = fixture.registry;
		try {
			const beta = fixture.repository("beta", "https://github.com/acme/beta.git");
			writeFileSync(
				fixture.registry,
				JSON.stringify(
					[
						{
							repo: "github.com/acme/moved",
							root: beta,
							source: "declared",
							addedAt: new Date().toISOString(),
						},
					],
					null,
					2,
				),
			);
			const { resolveBinding } = await import("../../../src/runtime/engine/promote.ts");
			const stale = resolveBinding(
				{ path: "src/service.ts", repo: "github.com/acme/moved" },
				{ kind: "none", surface: "this caller" },
			);
			expect(stale.resolved).toBe(false);
			expect(stale.link).toBeUndefined();
			expect(stale.note).toContain(betaIdentity);
			expect(stale.note).not.toContain(`file://${beta}/src/service.ts`);
		} finally {
			if (previous === undefined) delete process.env.ARCHBOARD_REPOS;
			else process.env.ARCHBOARD_REPOS = previous;
		}
	});
});
