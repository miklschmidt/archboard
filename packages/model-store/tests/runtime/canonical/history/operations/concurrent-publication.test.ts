import { afterEach, expect, test } from "bun:test";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { changeArchitecturePublication, readArchitectureModel } from "@archboard/model-store";
import { readArchitectureCheckpoint } from "#runtime/canonical/history/retained-reading/operations/read.ts";
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
	await changeArchitecturePublication(vault, "configure", destination);
	await changeArchitecturePublication(vault, "publish", {
		...destination,
		checkpoint: baseline.id,
	});
	const other = join(home, "other");
	git(root, "clone", "--quiet", "--single-branch", "--branch=main", `file://${root}`, other);
	git(other, "remote", "set-url", "origin", "https://github.com/acme/shop.git");
	git(other, "remote", "add", "archive", `file://${remote}`);
	signing(other, key);
	const otherVault = join(other, ".archboard/vault");
	await changeArchitecturePublication(otherVault, "configure", destination);
	await changeArchitecturePublication(otherVault, "fetch", {
		...destination,
		checkpoint: baseline.id,
	});
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
	await changeArchitecturePublication(vault, "publish", { ...destination, checkpoint: first.id });
	const currentA = readArchitectureModel(vault);
	const currentB = readArchitectureModel(otherVault);
	const index = readFileSync(join(other, ".git/index"));
	const head = git(other, "rev-parse", "HEAD");
	git(other, "config", "user.signingkey", join(home, "missing-signer"));
	const signingFailure = await changeArchitecturePublication(otherVault, "publish", {
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
	const published = await changeArchitecturePublication(otherVault, "publish", {
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
	expect(
		git(other, "rev-list", "--parents", "-n", "1", tip).split(" ").slice(1).toSorted(),
	).toEqual([first.id, second.id].toSorted());
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
