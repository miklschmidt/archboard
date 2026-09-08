import { describe, expect, test } from "bun:test";
import {
	chmodSync,
	existsSync,
	mkdirSync,
	readFileSync,
	realpathSync,
	writeFileSync,
} from "node:fs";
import { join } from "node:path";
import type { ZodType } from "zod";
import {
	RepoAddResultSchema,
	RepoForgetResultSchema,
	RepoListJsonResultSchema,
} from "../../../src/cli/commands/repo.ts";
import {
	GIT_PROCESS_GROUP_CLEANUP_MS,
	GIT_PROCESS_GROUP_POLL_MS,
} from "../../../src/shared/timing/timing.ts";
import {
	createRepositoryFixture,
	repositoryFailure,
	type RepositorySpawn,
} from "./support/repository-fixture.ts";
import { packageBin } from "./support/package-cli.ts";
import { listProcessGroupObservations, readProcessObservation } from "@/shared/process-observation";

function decodeRepository<T>(result: RepositorySpawn, schema: ZodType<T>): T {
	const diagnostic = repositoryFailure(result);
	let decoded: unknown;
	try {
		decoded = JSON.parse(result.stdout);
	} catch (error) {
		throw new Error(`${diagnostic}\nJSON decode: ${(error as Error).message}`, { cause: error });
	}
	const parsed = schema.safeParse(decoded);
	if (!parsed.success) {
		throw new Error(`${diagnostic}\nschema: ${parsed.error.message}`, { cause: parsed.error });
	}
	return parsed.data;
}

const alphaIdentity = "github.com/acme/alpha";
const betaIdentity = "github.com/acme/beta";

function processExists(pid: number): boolean {
	const observation = readProcessObservation(pid);
	return observation !== undefined && observation.state !== "zombie";
}

function processGroupExists(pgid: number): boolean {
	return listProcessGroupObservations(pgid).some((observation) => observation.state !== "zombie");
}

async function within<T>(promise: Promise<T>, message: string): Promise<T> {
	let timer: ReturnType<typeof setTimeout> | undefined;
	try {
		return await Promise.race([
			promise,
			new Promise<never>((_resolve, reject) => {
				timer = setTimeout(() => reject(new Error(message)), GIT_PROCESS_GROUP_CLEANUP_MS);
			}),
		]);
	} finally {
		if (timer !== undefined) {
			clearTimeout(timer);
		}
	}
}

async function waitForProcessAbsence(pid: number): Promise<void> {
	const deadline = Date.now() + GIT_PROCESS_GROUP_CLEANUP_MS;
	while (processExists(pid)) {
		if (Date.now() >= deadline) {
			throw new Error(`process ${pid} survived`);
		}
		await Bun.sleep(GIT_PROCESS_GROUP_POLL_MS);
	}
}

async function waitForGroupAbsence(pgid: number): Promise<void> {
	const deadline = Date.now() + GIT_PROCESS_GROUP_CLEANUP_MS;
	while (processGroupExists(pgid)) {
		if (Date.now() >= deadline) {
			throw new Error(`process group ${pgid} survived`);
		}
		await Bun.sleep(GIT_PROCESS_GROUP_POLL_MS);
	}
}

function killGroup(pgid: number): void {
	try {
		process.kill(-pgid, "SIGKILL");
	} catch (cause) {
		if ((cause as NodeJS.ErrnoException).code !== "ESRCH") {
			throw cause;
		}
	}
}
describe("repository registry package behavior", () => {
	test("adds, lists, and forgets an isolated checkout", () => {
		using fixture = createRepositoryFixture();
		const alpha = fixture.repository("alpha", "git@github.com:acme/alpha.git");
		const added = fixture.run(["repo", "add", alpha]);
		let diagnostic = repositoryFailure(added);
		expect(added.status, diagnostic).toBe(0);
		expect(added.signal, diagnostic).toBeNull();
		expect(decodeRepository(added, RepoAddResultSchema), diagnostic).toMatchObject({
			repo: alphaIdentity,
			root: alpha,
		});
		const listed = fixture.run(["repo", "list"]);
		diagnostic = repositoryFailure(listed);
		expect(listed.status, diagnostic).toBe(0);
		expect(decodeRepository(listed, RepoListJsonResultSchema).repos, diagnostic).toEqual([
			expect.objectContaining({ repo: alphaIdentity, root: alpha, source: "declared" }),
		]);
		const forgotten = fixture.run(["repo", "forget", alphaIdentity]);
		diagnostic = repositoryFailure(forgotten);
		expect(forgotten.status, diagnostic).toBe(0);
		expect(decodeRepository(forgotten, RepoForgetResultSchema), diagnostic).toBeDefined();
		const empty = fixture.run(["repo", "list"]);
		diagnostic = repositoryFailure(empty);
		expect(empty.status, diagnostic).toBe(0);
		expect(decodeRepository(empty, RepoListJsonResultSchema).repos, diagnostic).toEqual([]);
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
	test("one frozen checkout inspection does not follow later origin or HEAD changes", async () => {
		using fixture = createRepositoryFixture();
		const alpha = fixture.repository("alpha", "git@github.com:acme/alpha.git");
		const { inspectCheckout } = await import("../../../src/runtime/engine/git.ts");
		const before = await inspectCheckout(alpha);
		expect(before).toBeDefined();
		expect(Object.isFrozen(before)).toBeTrue();
		const prior = { ...before! };
		for (const args of [
			["remote", "set-url", "origin", "https://github.com/acme/changed.git"],
			["checkout", "-qb", "changed"],
		] as const) {
			const result = Bun.spawnSync(["git", ...args], { cwd: alpha, stderr: "pipe" });
			expect(result.exitCode, result.stderr.toString()).toBe(0);
		}
		const after = await inspectCheckout(alpha);
		expect(before).toEqual(prior);
		expect(after).toMatchObject({
			identity: "github.com/acme/changed",
			branch: "changed",
			commit: prior.commit,
		});
	});

	test("inspects an unborn checkout without inventing a commit", async () => {
		using fixture = createRepositoryFixture();
		const checkout = join(fixture.root, "unborn");
		mkdirSync(checkout);
		for (const args of [
			["init", "-q"],
			["remote", "add", "origin", "https://github.com/acme/unborn.git"],
		] as const) {
			const result = Bun.spawnSync(["git", ...args], { cwd: checkout, stderr: "pipe" });
			expect(result.exitCode, result.stderr.toString()).toBe(0);
		}
		const { inspectCheckout } = await import("../../../src/runtime/engine/git.ts");
		expect(await inspectCheckout(checkout)).toEqual({
			root: realpathSync(checkout),
			identity: "github.com/acme/unborn",
		});
	});

	test("resolves absolute, named, and ambient paths in declared order", async () => {
		using fixture = createRepositoryFixture();
		const previous = process.env["ARCHBOARD_REPOS"];
		process.env["ARCHBOARD_REPOS"] = fixture.registry;
		try {
			const alpha = fixture.repository("alpha", "git@github.com:acme/alpha.git");
			const beta = fixture.repository("beta", "https://github.com/acme/beta.git");
			const { PromotionError, resolveBinding } =
				await import("../../../src/runtime/engine/promote.ts");
			const { declareRepo, checkoutFor, listRepos } =
				await import("../../../src/runtime/engine/repo-registry.ts");
			await declareRepo(alpha);
			let refused: unknown;
			try {
				await resolveBinding({ path: "src/service.ts" }, { kind: "none", surface: "this caller" });
			} catch (error) {
				refused = error;
			}
			expect(refused).toBeInstanceOf(PromotionError);
			const refusal = (refused as Error).message;
			expect(refusal).toContain("no working directory to resolve it against");
			expect(refusal).toContain("absolute path");
			expect(refusal).toContain("repository");
			expect(refusal).toContain(alphaIdentity);
			const absolute = await resolveBinding(
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
			const named = await resolveBinding(
				{ path: "src/service.ts", repo: betaIdentity },
				{ kind: "none", surface: "this caller" },
			);
			expect(named).toMatchObject({ resolved: true, resolvedFrom: "registry" });
			expect(named).not.toHaveProperty("link");
			const ambient = await resolveBinding({ path: "src/service.ts" }, { kind: "cwd", dir: alpha });
			expect(ambient).toMatchObject({
				resolved: true,
				resolvedFrom: "cwd",
				address: { repo: alphaIdentity },
			});
			expect(ambient.note).toContain("You named no repository");
			const namedOverAmbient = await resolveBinding(
				{ path: "src/service.ts", repo: betaIdentity },
				{ kind: "cwd", dir: alpha },
			);
			expect(namedOverAmbient).toMatchObject({
				resolved: true,
				resolvedFrom: "registry",
				address: { repo: betaIdentity, path: "src/service.ts" },
			});
			expect(namedOverAmbient).not.toHaveProperty("link");

			const missing = await resolveBinding({ path: "src/nope.ts" }, { kind: "cwd", dir: alpha });
			expect(missing).toMatchObject({
				resolved: true,
				address: { repo: alphaIdentity, path: "src/nope.ts" },
			});
			expect(missing).not.toHaveProperty("link");

			const outside = await resolveBinding(
				{ path: "src/service.ts" },
				{ kind: "cwd", dir: fixture.nowhere },
			);
			expect(outside.resolved).toBe(false);
			expect(outside.note).toContain(fixture.nowhere);
		} finally {
			if (previous === undefined) {
				delete process.env["ARCHBOARD_REPOS"];
			} else {
				process.env["ARCHBOARD_REPOS"] = previous;
			}
		}
	});

	test("retains portable intent when a checkout is unknown", async () => {
		using fixture = createRepositoryFixture();
		const previous = process.env["ARCHBOARD_REPOS"];
		process.env["ARCHBOARD_REPOS"] = fixture.registry;
		try {
			const { resolveBinding } = await import("../../../src/runtime/engine/promote.ts");
			const unknown = await resolveBinding(
				{ path: "src/service.ts", repo: "github.com/acme/never-cloned" },
				{ kind: "none", surface: "this caller" },
			);
			expect(unknown).toMatchObject({
				resolved: false,
				address: { repo: "github.com/acme/never-cloned", path: "src/service.ts" },
			});
			expect(unknown).not.toHaveProperty("link");
			expect(unknown.note).toContain("repo add");
		} finally {
			if (previous === undefined) {
				delete process.env["ARCHBOARD_REPOS"];
			} else {
				process.env["ARCHBOARD_REPOS"] = previous;
			}
		}
	});

	test("refuses a stale checkout instead of falling back to the wrong repository", async () => {
		using fixture = createRepositoryFixture();
		const previous = process.env["ARCHBOARD_REPOS"];
		process.env["ARCHBOARD_REPOS"] = fixture.registry;
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
			const stale = await resolveBinding(
				{ path: "src/service.ts", repo: "github.com/acme/moved" },
				{ kind: "none", surface: "this caller" },
			);
			expect(stale.resolved).toBe(false);
			expect(stale).not.toHaveProperty("link");
			expect(stale.note).toContain(betaIdentity);
			expect(stale.note).not.toContain(`file://${beta}/src/service.ts`);
		} finally {
			if (previous === undefined) {
				delete process.env["ARCHBOARD_REPOS"];
			} else {
				process.env["ARCHBOARD_REPOS"] = previous;
			}
		}
	});
});

test("an interrupted repository command reaps its detached Git group", async () => {
	using fixture = createRepositoryFixture();
	const checkout = fixture.repository("interrupt", "https://github.com/acme/interrupt.git");
	const bin = join(fixture.root, "bin");
	const marker = join(fixture.root, "git-pids");
	const descendantMarker = `${marker}.descendant`;
	const helperReady = `${marker}.helper-ready`;
	const helperPid = `${marker}.helper-pid`;
	const releaseLeader = `${marker}.release-leader`;
	mkdirSync(bin);
	const detachedHelper = join(bin, "detached-helper.ts");
	writeFileSync(
		detachedHelper,
		`const [command, pidPath] = process.argv.slice(2);
if (!command || !pidPath) throw new Error("detached helper arguments are required");
const child = Bun.spawn(["/bin/sh", "-c", command], {
	detached: true,
	stdin: "ignore",
	stdout: "ignore",
	stderr: "ignore",
});
if (child.pid === undefined) throw new Error("detached helper did not return a pid");
await Bun.write(pidPath, String(child.pid) + "\\n");
`,
	);
	writeFileSync(
		join(bin, "git"),
		`#!/bin/sh
(
  sleep 60 </dev/null >/dev/null 2>&1 &
  echo "$!" > ${JSON.stringify(descendantMarker)}
  ${JSON.stringify(process.execPath)} ${JSON.stringify(detachedHelper)} ${JSON.stringify(`echo ready > ${JSON.stringify(helperReady)}; sleep 60`)} ${JSON.stringify(helperPid)}
) &
while [ ! -e ${JSON.stringify(descendantMarker)} ] || [ ! -e ${JSON.stringify(helperReady)} ] || [ ! -e ${JSON.stringify(helperPid)} ]; do sleep 0.01; done
helper=$(cat ${JSON.stringify(helperPid)})
echo "$$ $(cat ${JSON.stringify(descendantMarker)}) $helper $PPID" > ${JSON.stringify(marker)}
while [ ! -e ${JSON.stringify(releaseLeader)} ]; do sleep 0.01; done
exit 0
`,
	);
	chmodSync(join(bin, "git"), 0o700);
	const child = Bun.spawn([packageBin, "repo", "add", checkout], {
		cwd: fixture.nowhere,
		detached: true,
		stdin: "ignore",
		stdout: "pipe",
		stderr: "pipe",
		env: {
			...fixture.serverEnvironment,
			PATH: `${bin}:${process.env["PATH"] ?? ""}`,
		},
	});
	const output = Promise.all([
		new Response(child.stdout).text(),
		new Response(child.stderr).text(),
	]);
	let gitPids: number[] = [];
	const cleanupGroups = new Set<number>();
	let primaryFailure: unknown;
	let cleanupFailure: unknown;
	try {
		const deadline = Date.now() + 2_000;
		while (!existsSync(marker)) {
			if (Date.now() >= deadline) {
				throw new Error("The fake Git child did not start.");
			}
			await Bun.sleep(5);
		}
		gitPids = readFileSync(marker, "utf8").trim().split(/\s+/u).map(Number);
		const [leader, descendant, helper, ownerPid] = gitPids;
		if (
			leader === undefined ||
			descendant === undefined ||
			helper === undefined ||
			ownerPid === undefined
		) {
			throw new Error(`Malformed fake Git process record: ${JSON.stringify(gitPids)}`);
		}
		const leaderObservation = readProcessObservation(leader);
		const ownerObservation = readProcessObservation(ownerPid);
		const cliObservation = readProcessObservation(child.pid);
		const helperObservation = readProcessObservation(helper);
		for (const observation of [
			leaderObservation,
			ownerObservation,
			cliObservation,
			helperObservation,
		]) {
			if (observation !== undefined) cleanupGroups.add(observation.pgid);
		}
		if (
			leaderObservation === undefined ||
			ownerObservation === undefined ||
			cliObservation === undefined ||
			helperObservation === undefined
		) {
			throw new Error("The interrupted repository process tree vanished before capture.");
		}
		const gitGroup = leaderObservation.pgid;
		const cliGroup = cliObservation.pgid;
		expect(gitGroup, "Git's spawned owner must lead the detached group under test").toBe(ownerPid);
		expect(cliGroup, "the CLI fixture must lead its detached owner group").toBe(child.pid);
		expect(helperObservation.pgid, "the helper must lead its detached cleanup group").toBe(helper);
		expect(ownerObservation.pgid, "Git's owner must remain in its detached group").toBe(gitGroup);
		expect(
			processExists(descendant),
			"the redirected Git descendant must exist before its leader exits",
		).toBeTrue();
		expect(
			processGroupExists(gitGroup),
			"the detached Git owner group must be observable",
		).toBeTrue();
		writeFileSync(releaseLeader, "released\n");
		process.kill(child.pid, "SIGTERM");
		await waitForProcessAbsence(leader);
		expect(
			processExists(helper),
			"Git cleanup must not signal an unrelated detached group",
		).toBeTrue();
		killGroup(helper);
		await within(child.exited, "the interrupted CLI leader did not settle");
		await within(
			output.then(() => undefined),
			"the interrupted CLI pipes did not settle",
		);
		await waitForGroupAbsence(gitGroup);
		for (const pid of gitPids) {
			expect(processExists(pid), `Git process ${pid} remained when the CLI exited`).toBeFalse();
		}
	} catch (cause) {
		primaryFailure = cause;
	} finally {
		try {
			for (const pgid of cleanupGroups) {
				killGroup(pgid);
			}
			try {
				child.kill("SIGKILL");
			} catch {}
			await within(
				Promise.allSettled([child.exited, output]).then(() => undefined),
				"the interrupted CLI owner did not settle during cleanup",
			);
			for (const pgid of cleanupGroups) {
				await waitForGroupAbsence(pgid);
			}
			for (const pid of gitPids) {
				await waitForProcessAbsence(pid);
			}
		} catch (cause) {
			cleanupFailure = cause;
		}
	}
	if (primaryFailure !== undefined) {
		if (cleanupFailure !== undefined) {
			throw new AggregateError(
				[primaryFailure, cleanupFailure],
				"CLI interrupt failed and cleanup failed",
				{
					cause: primaryFailure,
				},
			);
		}
		throw primaryFailure;
	}
	if (cleanupFailure !== undefined) {
		throw cleanupFailure;
	}
}, 10_000);
