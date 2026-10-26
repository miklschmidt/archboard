import { afterEach, expect, test } from "bun:test";
import { readFileSync, writeFileSync, renameSync } from "node:fs";
import { join } from "node:path";
import {
	listArchitectureCheckpoints,
	readArchitecturePublication,
} from "@archboard/board/store-read";
import {
	configureArchitecturePublication,
	publishArchitectureHistory,
} from "@archboard/board/store-write";
import {
	cleanPublicationFixtures,
	publicationFixture,
	git,
	retain,
} from "#tests/runtime/support/publication-fixture.ts";

afterEach(cleanPublicationFixtures);

test("explicit archive publication persists evidence while code pushes remain local-only", async () => {
	const { root, vault, remote, destination } = publicationFixture();
	const checkpoint = await retain(vault);
	git(root, "push", "--quiet", "archive", "main:main");
	expect(await readArchitecturePublication(vault, checkpoint.id)).toMatchObject({
		success: true,
		publication: "saved-locally",
		checkpoint: checkpoint.id,
	});
	expect(await configureArchitecturePublication(vault, destination)).toMatchObject({
		success: true,
		destination,
		retention: { protected: false, limitation: expect.any(String), recovery: expect.any(String) },
	});
	writeFileSync(join(root, "code.ts"), "export const version = 2;\n");
	git(root, "add", "code.ts");
	writeFileSync(join(root, "code.ts"), "export const version = 3;\n");
	const index = readFileSync(join(root, ".git/index"));
	const head = git(root, "rev-parse", "HEAD");
	const status = git(root, "status", "--porcelain");
	const published = await publishArchitectureHistory(vault, {
		...destination,
		checkpoint: checkpoint.id,
	});
	expect(published).toMatchObject({
		success: true,
		publication: "published",
		checkpoint: checkpoint.id,
		destination,
	});
	expect(git(remote, "rev-parse", destination.ref)).toBe(checkpoint.id);
	expect(await readArchitecturePublication(vault, checkpoint.id)).toMatchObject(published);
	expect(await listArchitectureCheckpoints(vault)).toMatchObject({
		success: true,
		checkpoints: [{ id: checkpoint.id, publication: "published", state: checkpoint.state }],
	});
	expect(git(root, "rev-parse", "HEAD")).toBe(head);
	expect(git(root, "status", "--porcelain")).toBe(status);
	expect(readFileSync(join(root, ".git/index"))).toEqual(index);
});

test("network failure persists publication-pending and never reverses local retention", async () => {
	const { root, vault, destination, remote } = publicationFixture();
	const checkpoint = await retain(vault);
	await configureArchitecturePublication(vault, destination);
	const local = await listArchitectureCheckpoints(vault);
	const hidden = `${remote}.offline`;
	renameSync(remote, hidden);
	const failed = await publishArchitectureHistory(vault, {
		...destination,
		checkpoint: checkpoint.id,
	});
	expect(failed).toMatchObject({
		success: false,
		code: "ARCHIVE_NETWORK_FAILED",
		publication: "publication-pending",
		checkpoint: checkpoint.id,
	});
	expect(await readArchitecturePublication(vault, checkpoint.id)).toMatchObject({
		success: true,
		publication: "publication-pending",
	});
	expect(await listArchitectureCheckpoints(vault)).toMatchObject({
		success: true,
		checkpoints: [
			{ id: checkpoint.id, publication: "publication-pending", revision: checkpoint.revision },
		],
	});
	if (!local.success) throw new Error(JSON.stringify(local));
	expect(git(root, "rev-parse", "archboard-history")).toBe(checkpoint.id);
	renameSync(hidden, remote);
	expect(
		await publishArchitectureHistory(vault, { ...destination, checkpoint: checkpoint.id }),
	).toMatchObject({ success: true, publication: "published" });
});
