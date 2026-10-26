import { afterEach, expect, test } from "bun:test";
import { cpSync, existsSync, readFileSync, rmSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { readArchitectureCheckpoint, readArchitectureModel } from "@archboard/board/store-read";
import {
	initializeArchitectureArchive,
	retainArchitectureCheckpoint,
	editArchitectureModule,
	claimArchitectureSubjects,
	configureArchitecturePublication,
	publishArchitectureHistory,
	fetchArchitectureHistory,
} from "@archboard/board/store-write";
import { git, signing } from "#tests/runtime/support/publication-fixture.ts";

import {
	untrackedFixture as fixture,
	snapshot,
	cleanPrivateArchiveFixtures,
} from "#tests/runtime/support/private-archive-fixture.ts";
afterEach(cleanPrivateArchiveFixtures);

test("an explicit private archive retains exact architecture without creating a source repository", async () => {
	const { root, vault } = fixture();
	const current = readArchitectureModel(vault);
	if (!current.success) throw new Error(JSON.stringify(current));
	const request = {
		target: "current" as const,
		operationId: "first",
		writer: "agent",
		doing: "retaining local architecture",
		expectedRevision: current.revision.digest,
		dependencies: [],
	};
	expect(await retainArchitectureCheckpoint(vault, request)).toMatchObject({
		success: false,
		code: "ARCHIVE_NOT_INITIALIZED",
	});
	expect(existsSync(join(root, ".git"))).toBe(false);
	const initialized = await initializeArchitectureArchive(vault);
	expect(initialized).toMatchObject({ success: true });
	if (!initialized.success) throw new Error(JSON.stringify(initialized));
	expect(git(initialized.archive, "rev-parse", "--is-bare-repository")).toBe("true");
	git(initialized.archive, "config", "user.name", "Local Author");
	git(initialized.archive, "config", "user.email", "local@example.test");
	git(initialized.archive, "config", "commit.gpgsign", "false");
	const retained = await retainArchitectureCheckpoint(vault, request);
	if (!retained.success) throw new Error(JSON.stringify(retained));
	expect(retained.checkpoint).toMatchObject({
		sources: [],
		publication: "saved-locally",
		revision: current.revision,
	});
	expect(await initializeArchitectureArchive(vault)).toEqual(initialized);
	expect(await retainArchitectureCheckpoint(vault, request)).toEqual(retained);
	expect(await readArchitectureCheckpoint(vault, retained.checkpoint.id)).toMatchObject({
		success: true,
		revision: current.revision,
	});
	expect(readArchitectureModel(vault)).toEqual(current);
	expect(readFileSync(join(vault, "gateway.module.json"))).toEqual(
		readFileSync(resolve("examples/canonical-model/.archboard/vault/gateway.module.json")),
	);
	expect(existsSync(join(root, ".git"))).toBe(false);
	expect(existsSync(join(vault, ".git"))).toBe(false);
});

test("private initialization refuses source repositories without changing any source administrative files", async () => {
	const { root, vault } = fixture();
	git(root, "init", "--quiet", "--initial-branch=main");
	const before = snapshot(root);
	expect(await initializeArchitectureArchive(vault)).toMatchObject({
		success: false,
		code: "ARCHIVE_IN_USE",
	});
	expect(snapshot(root)).toEqual(before);
});

test("private initialization refuses a state directory inside a source repository", async () => {
	const { home, vault } = fixture();
	const source = join(home, "source");
	mkdirSync(source);
	git(source, "init", "--quiet");
	process.env["XDG_STATE_HOME"] = join(source, "private-state");
	const before = snapshot(source);
	expect(await initializeArchitectureArchive(vault)).toMatchObject({
		success: false,
		code: "ARCHIVE_IN_USE",
	});
	expect(snapshot(source)).toEqual(before);
	expect(existsSync(join(source, "private-state"))).toBe(false);
});

test("private edits honor signing, retain dependency history and publish only to an explicit destination", async () => {
	const { home, root, vault } = fixture();
	const initialized = await initializeArchitectureArchive(vault);
	if (!initialized.success) throw new Error(JSON.stringify(initialized));
	const archive = initialized.archive;
	git(archive, "config", "user.name", "Local Author");
	git(archive, "config", "user.email", "local@example.test");
	git(archive, "config", "gpg.format", "ssh");
	git(archive, "config", "commit.gpgsign", "true");
	git(archive, "config", "user.signingkey", join(home, "missing-key"));
	const current = readArchitectureModel(vault);
	if (!current.success || current.manifest.current === null)
		throw new Error(JSON.stringify(current));
	const target = { model: current.manifest.id, state: current.manifest.current.id };
	const claim = await claimArchitectureSubjects(vault, {
		target,
		writer: "agent",
		reason: "explaining local architecture",
		subjects: ["Shop#Gateway"],
	});
	if (!claim.success) throw new Error(JSON.stringify(claim));
	const request = {
		target,
		operationId: "local-edit",
		writer: "agent",
		doing: "explaining private history",
		expectedRevision: current.revision,
		subject: "Shop#Gateway",
		claim: claim.claim.id,
		description: "The local architecture remains independent of source code.",
	};
	const refused = await editArchitectureModule(vault, request);
	expect(refused).toMatchObject({
		success: false,
		code: "ARCHIVE_COMMIT_FAILED",
		applied: false,
		diagnostics: [{ recovery: expect.any(String) }],
	});
	expect(readArchitectureModel(vault)).toEqual(current);
	expect(git(archive, "config", "--get", "commit.gpgsign")).toBe("true");
	const key = join(home, "signer");
	expect(Bun.spawnSync(["ssh-keygen", "-q", "-t", "ed25519", "-N", "", "-f", key]).exitCode).toBe(
		0,
	);
	signing(archive, key);
	const baseline = await retainArchitectureCheckpoint(vault, {
		target: "current",
		operationId: "baseline",
		writer: "agent",
		doing: "retaining the local baseline",
		expectedRevision: current.revision.digest,
		dependencies: [],
	});
	if (!baseline.success) throw new Error(JSON.stringify(baseline));
	const edited = await editArchitectureModule(vault, request);
	if (!edited.success) throw new Error(JSON.stringify(edited));
	git(archive, "verify-commit", edited.checkpoint.id);
	git(archive, "merge-base", "--is-ancestor", baseline.checkpoint.id, edited.checkpoint.id);
	expect(edited).toMatchObject({
		applied: true,
		checkpoint: { sources: [], publication: "saved-locally" },
	});
	expect(await editArchitectureModule(vault, request)).toEqual(edited);
	const remote = join(home, "remote.git");
	git(archive, "init", "--quiet", "--bare", remote);
	git(archive, "remote", "add", "archive", `file://${remote}`);
	const destination = { remote: "archive", ref: "refs/heads/archboard-history" };
	expect(
		await publishArchitectureHistory(vault, { ...destination, checkpoint: edited.checkpoint.id }),
	).toMatchObject({ success: false, code: "PUBLICATION_NOT_CONFIGURED" });
	expect(git(remote, "for-each-ref", "--format=%(refname)")).toBe("");
	expect(await configureArchitecturePublication(vault, destination)).toMatchObject({
		success: true,
		publication: "saved-locally",
	});
	expect(git(remote, "for-each-ref", "--format=%(refname)")).toBe("");
	expect(
		await publishArchitectureHistory(vault, { ...destination, checkpoint: edited.checkpoint.id }),
	).toMatchObject({ success: true, publication: "published" });
	const objects = git(remote, "rev-list", "--objects", "--all").split("\n");
	for (const object of objects) {
		const id = object.split(" ")[0]!;
		const bytes = git(remote, "cat-file", "-p", id);
		expect(bytes).not.toContain(home);
	}
	const peer = join(home, "peer/.archboard/vault");
	cpSync(vault, peer, { recursive: true });
	const peerInit = await initializeArchitectureArchive(peer);
	if (!peerInit.success) throw new Error(JSON.stringify(peerInit));
	expect(peerInit.archive).not.toBe(archive);
	git(peerInit.archive, "remote", "add", "archive", `file://${remote}`);
	await configureArchitecturePublication(peer, destination);
	expect(
		await fetchArchitectureHistory(peer, { ...destination, checkpoint: edited.checkpoint.id }),
	).toMatchObject({ success: true, publication: "published" });
	expect(await readArchitectureCheckpoint(peer, edited.checkpoint.id)).toMatchObject({
		success: true,
		revision: edited.after,
		sourceEvidence: [],
	});
	expect(await readArchitectureCheckpoint(peer, baseline.checkpoint.id)).toMatchObject({
		success: true,
		revision: current.revision,
	});
	expect(existsSync(join(root, ".git"))).toBe(false);
}, 30000);

test("existing damaged storage is preserved and a new source repository never replaces private history", async () => {
	const { root, vault } = fixture();
	const initialized = await initializeArchitectureArchive(vault);
	if (!initialized.success) throw new Error(JSON.stringify(initialized));
	git(root, "init", "--quiet");
	const source = snapshot(join(root, ".git"));
	expect(
		await retainArchitectureCheckpoint(vault, {
			target: "current",
			operationId: "new-source",
			writer: "agent",
			doing: "preserving private history",
			expectedRevision: "0".repeat(64),
			dependencies: [],
		}),
	).toMatchObject({ success: false, code: "ARCHIVE_IN_USE" });
	expect(snapshot(join(root, ".git"))).toEqual(source);
	rmSync(join(root, ".git"), { recursive: true });
	rmSync(join(initialized.archive, "HEAD"));
	const damaged = snapshot(initialized.archive);
	expect(await initializeArchitectureArchive(vault)).toMatchObject({
		success: false,
		code: "ARCHIVE_UNREADABLE",
	});
	expect(snapshot(initialized.archive)).toEqual(damaged);
});
