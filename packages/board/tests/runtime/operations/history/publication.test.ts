import { afterEach, expect, test } from "bun:test";
import { readFileSync, writeFileSync, renameSync } from "node:fs";
import { join } from "node:path";
import {
	listArchitectureCheckpoints,
	readArchitectureCheckpoint,
	readArchitecturePublication,
} from "@archboard/board/store-read";
import {
	configureArchitecturePublication,
	publishArchitectureHistory,
	editArchitectureModule,
} from "@archboard/board/store-write";
import { intent } from "#tests/runtime/operations/model-edit/fixture.ts";
import {
	cleanPublicationFixtures,
	publicationFixture,
	git,
	retain,
	changeResponsibility,
} from "#tests/runtime/support/publication-fixture.ts";

afterEach(cleanPublicationFixtures);

test("publication refreshes reading evidence without changing a completed edit receipt", async () => {
	const { vault, destination } = publicationFixture();
	const { subject, description: _description, ...envelope } = await intent(vault, "published-edit");
	const request = {
		...envelope,
		changes: [{ type: "edit-module" as const, subject, set: { name: "API" } }],
	};
	const completed = await editArchitectureModule(vault, request);
	if (!completed.success) throw new Error(JSON.stringify(completed));
	await configureArchitecturePublication(vault, destination);
	expect(
		await publishArchitectureHistory(vault, {
			...destination,
			checkpoint: completed.checkpoint.id,
		}),
	).toMatchObject({ success: true, publication: "published" });
	expect(await readArchitectureCheckpoint(vault, completed.checkpoint.id)).toMatchObject({
		success: true,
		checkpoint: { id: completed.checkpoint.id, publication: "published" },
		revision: completed.after,
	});
	expect(await editArchitectureModule(vault, request)).toEqual(completed);
});

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
	expect(await readArchitecturePublication(vault, checkpoint.id)).toMatchObject({
		success: true,
		publication: "published",
		checkpoint: checkpoint.id,
		destination,
	});
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
	const baseline = await retain(vault, "baseline");
	changeResponsibility(vault, "Depends on an unpublished baseline");
	const checkpoint = await retain(vault, "dependent", [baseline.id]);
	await configureArchitecturePublication(vault, destination);
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
			{ id: baseline.id, publication: "publication-pending", revision: baseline.revision },
		],
	});
	expect(git(root, "rev-parse", "archboard-history")).toBe(checkpoint.id);
	renameSync(hidden, remote);
	expect(
		await publishArchitectureHistory(vault, { ...destination, checkpoint: checkpoint.id }),
	).toMatchObject({ success: true, publication: "published" });
}, 30_000);

test("publication evidence is private, shared by linked worktrees, and invalidated by a changed remote", async () => {
	const { home, root, vault, destination } = publicationFixture();
	const checkpoint = await retain(vault);
	await configureArchitecturePublication(vault, destination);
	await publishArchitectureHistory(vault, { ...destination, checkpoint: checkpoint.id });
	const linked = join(home, "linked");
	git(root, "worktree", "add", "--quiet", "-b", "parallel", linked);
	const addressed = join(linked, ".archboard/vault");
	expect(await readArchitecturePublication(addressed, checkpoint.id)).toMatchObject({
		success: true,
		publication: "published",
		destination,
	});
	git(root, "remote", "set-url", "archive", `file://${join(home, "different.git")}`);
	expect(await readArchitecturePublication(vault, checkpoint.id)).toMatchObject({
		success: false,
		code: "PUBLICATION_DESTINATION_CHANGED",
	});
	expect(await readArchitectureCheckpoint(vault, checkpoint.id)).toMatchObject({
		success: true,
		revision: checkpoint.revision,
	});
	expect(
		await publishArchitectureHistory(vault, { ...destination, checkpoint: checkpoint.id }),
	).toMatchObject({ success: false, code: "PUBLICATION_DESTINATION_CHANGED" });
	const next = await retain(vault, "still-local");
	expect(next.publication).toBe("saved-locally");
}, 30_000);
