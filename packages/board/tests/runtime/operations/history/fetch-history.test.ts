import { afterEach, expect, test } from "bun:test";
import { cpSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
	listArchitectureCheckpoints,
	readArchitectureModel,
	readArchitectureCheckpoint,
	readArchitecturePublication,
} from "@archboard/board/store-read";
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
} from "#tests/runtime/support/publication-fixture.ts";

afterEach(cleanPublicationFixtures);

test("an explicit named archive fetch restores the full dependency closure in a shallow source clone", async () => {
	const { home, root, vault, destination, remote } = publicationFixture();
	const baseline = await retain(vault);
	changeResponsibility(vault, "Reads the retained newer architecture");
	const checkpoint = await retain(vault, "dependent", [baseline.id]);
	await configureArchitecturePublication(vault, destination);
	const published = await publishArchitectureHistory(vault, {
		...destination,
		checkpoint: checkpoint.id,
	});
	if (!published.success) throw new Error(JSON.stringify(published));
	writeFileSync(join(root, "code.ts"), "export const version = 2;\n");
	git(root, "add", "code.ts");
	git(root, "commit", "--quiet", "-m", "test: keep source ancestry shallow");
	git(root, "push", "--quiet", "archive", "main:main");
	const clone = join(home, "shallow-main");
	git(
		root,
		"clone",
		"--quiet",
		"--depth=1",
		"--single-branch",
		"--branch=main",
		`file://${remote}`,
		clone,
	);
	const addressed = join(clone, ".archboard/vault");
	git(clone, "remote", "add", "archive", `file://${remote}`);
	await configureArchitecturePublication(addressed, destination);
	writeFileSync(join(clone, "code.ts"), "staged\n");
	git(clone, "add", "code.ts");
	writeFileSync(join(clone, "code.ts"), "unstaged\n");
	const head = git(clone, "rev-parse", "HEAD");
	const index = readFileSync(join(clone, ".git/index"));
	const shallow = readFileSync(join(clone, ".git/shallow"));
	const fetchSpec = git(clone, "config", "--get-all", "remote.origin.fetch");
	const current = readArchitectureModel(addressed);
	expect(await readArchitectureCheckpoint(addressed, checkpoint.id)).toMatchObject({
		success: false,
		code: "ARCHITECTURE_UNAVAILABLE",
	});
	expect(await readArchitecturePublication(addressed, checkpoint.id)).toMatchObject({
		publication: "unavailable",
		destination,
	});
	expect(
		await fetchArchitectureHistory(addressed, { ...destination, checkpoint: checkpoint.id }),
	).toMatchObject({ success: true, publication: "published", checkpoint: checkpoint.id });
	expect(await readArchitectureCheckpoint(addressed, baseline.id)).toMatchObject({
		success: true,
		revision: baseline.revision,
		checkpoint: { id: baseline.id, publication: "published" },
	});
	expect(await readArchitectureCheckpoint(addressed, checkpoint.id)).toMatchObject({
		success: true,
		revision: checkpoint.revision,
		manifest: { current: checkpoint.state },
	});
	expect(readArchitectureModel(addressed)).toEqual(current);
	git(clone, "reflog", "expire", "--expire=now", "--all");
	git(clone, "gc", "--prune=now");
	const listed = await listArchitectureCheckpoints(addressed);
	expect(listed).toMatchObject({
		success: true,
		checkpoints: expect.arrayContaining([
			expect.objectContaining({ id: baseline.id }),
			expect.objectContaining({ id: checkpoint.id }),
		]),
	});
	expect(git(clone, "rev-parse", "HEAD")).toBe(head);
	expect(readFileSync(join(clone, ".git/index"))).toEqual(index);
	expect(readFileSync(join(clone, ".git/shallow"))).toEqual(shallow);
	expect(git(clone, "config", "--get-all", "remote.origin.fetch")).toBe(fetchSpec);
}, 30_000);

test("fetch deepens a truncated archive without moving a checked-out archive HEAD", async () => {
	const { home, root, vault, destination, remote } = publicationFixture();
	const baseline = await retain(vault);
	changeResponsibility(vault, "Keeps the full historical closure");
	const checkpoint = await retain(vault, "archive-shallow", [baseline.id]);
	await configureArchitecturePublication(vault, destination);
	await publishArchitectureHistory(vault, { ...destination, checkpoint: checkpoint.id });
	const clone = join(home, "shallow-archive");
	git(
		root,
		"clone",
		"--quiet",
		"--no-checkout",
		"--depth=1",
		"--single-branch",
		"--branch=architecture-archive",
		`file://${remote}`,
		clone,
	);
	const addressed = join(clone, ".archboard/vault");
	cpSync(vault, addressed, { recursive: true });
	git(clone, "remote", "add", "archive", `file://${remote}`);
	await configureArchitecturePublication(addressed, destination);
	const head = git(clone, "rev-parse", "HEAD");
	expect(await readArchitectureCheckpoint(addressed, checkpoint.id)).toMatchObject({
		success: false,
		code: "ARCHITECTURE_UNAVAILABLE",
	});
	expect(
		await fetchArchitectureHistory(addressed, { ...destination, checkpoint: checkpoint.id }),
	).toMatchObject({ success: true, publication: "published" });
	expect(await readArchitectureCheckpoint(addressed, baseline.id)).toMatchObject({
		success: true,
		revision: baseline.revision,
	});
	expect(git(clone, "rev-parse", "HEAD")).toBe(head);
});
