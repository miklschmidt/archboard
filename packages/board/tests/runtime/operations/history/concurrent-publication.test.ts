import { afterEach, expect, test } from "bun:test";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { readArchitectureModel, readArchitectureCheckpoint } from "@archboard/board/store-read";
import {
	configureArchitecturePublication,
	publishArchitectureHistory,
	fetchArchitectureHistory,
} from "@archboard/board/store-write";
import {
	cleanPublicationFixtures,
	publicationFixture,
	git,
	retain,
	changeResponsibility,
	signing,
} from "#tests/runtime/support/publication-fixture.ts";

afterEach(cleanPublicationFixtures);

// Two signed writers, a fetch, and a rejected push share this real Git workflow.
// The finite case budget covers process startup and does not wait on a product timer.
test("stale publication joins signed archive ancestry without merging distinct current models", async () => {
	const { home, root, vault, key, remote, destination } = publicationFixture();
	const baseline = await retain(vault);
	await configureArchitecturePublication(vault, destination);
	await publishArchitectureHistory(vault, { ...destination, checkpoint: baseline.id });
	const other = join(home, "other");
	git(root, "clone", "--quiet", "--single-branch", "--branch=main", `file://${root}`, other);
	git(other, "remote", "set-url", "origin", "https://github.com/acme/shop.git");
	git(other, "remote", "add", "archive", `file://${remote}`);
	signing(other, key);
	const otherVault = join(other, ".archboard/vault");
	await configureArchitecturePublication(otherVault, destination);
	await fetchArchitectureHistory(otherVault, { ...destination, checkpoint: baseline.id });
	changeResponsibility(vault, "Writer A's architecture");
	changeResponsibility(otherVault, "Writer B's architecture");
	const manifest = join(otherVault, "model.json");
	const original = JSON.parse(readFileSync(manifest, "utf8"));
	writeFileSync(
		manifest,
		JSON.stringify({ ...original, current: { id: "BranchB", name: "Parallel state" } }),
	);
	const first = await retain(vault, "writer-a");
	const second = await retain(otherVault, "writer-b", [baseline.id]);
	await publishArchitectureHistory(vault, { ...destination, checkpoint: first.id });
	const currentA = readArchitectureModel(vault);
	const currentB = readArchitectureModel(otherVault);
	const index = readFileSync(join(other, ".git/index"));
	const head = git(other, "rev-parse", "HEAD");
	git(other, "config", "user.signingkey", join(home, "missing-signer"));
	const signingFailure = await publishArchitectureHistory(otherVault, {
		...destination,
		checkpoint: second.id,
	});
	expect(signingFailure).toMatchObject({
		success: false,
		code: "ARCHIVE_COMMIT_FAILED",
		publication: "publication-pending",
	});
	expect(git(remote, "rev-parse", destination.ref)).toBe(first.id);
	git(other, "config", "user.signingkey", key);
	const published = await publishArchitectureHistory(otherVault, {
		...destination,
		checkpoint: second.id,
	});
	expect(published).toMatchObject({ success: true, publication: "published" });
	const tip = git(remote, "rev-parse", destination.ref);
	git(other, "verify-commit", tip);
	expect(git(other, "show", `${tip}:record.json`)).toBe(
		JSON.stringify({ schemaVersion: 1, kind: "synchronization" }),
	);
	expect(git(other, "ls-tree", "--name-only", tip)).toBe("record.json");
	expect(git(other, "rev-list", "--parents", "-n", "1", tip).split(" ").slice(1).sort()).toEqual(
		[first.id, second.id].sort(),
	);
	expect(await readArchitectureCheckpoint(otherVault, first.id)).toMatchObject({
		success: true,
		revision: first.revision,
		checkpoint: { id: first.id, publication: "published" },
	});
	expect(await readArchitectureCheckpoint(otherVault, second.id)).toMatchObject({
		success: true,
		revision: second.revision,
		manifest: { current: { id: "BranchB" } },
	});
	expect(readArchitectureModel(vault)).toEqual(currentA);
	expect(readArchitectureModel(otherVault)).toEqual(currentB);
	expect(readFileSync(join(other, ".git/index"))).toEqual(index);
	expect(git(other, "rev-parse", "HEAD")).toBe(head);
}, 45_000);
