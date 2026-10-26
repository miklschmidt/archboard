import { afterEach, expect, test } from "bun:test";
import { readArchitectureCheckpoint } from "@archboard/board/store-read";
import {
	configureArchitecturePublication,
	fetchArchitectureHistory,
	publishArchitectureHistory,
} from "@archboard/board/store-write";
import {
	cleanPublicationFixtures,
	publicationFixture,
	git,
	retain,
} from "#tests/runtime/support/publication-fixture.ts";

afterEach(cleanPublicationFixtures);

test("publication refuses private source paths without rewriting or losing the local checkpoint", async () => {
	const { root, vault, remote, destination } = publicationFixture();
	git(root, "remote", "set-url", "origin", `file://${root}`);
	const checkpoint = await retain(vault);
	await configureArchitecturePublication(vault, destination);
	expect(
		await publishArchitectureHistory(vault, { ...destination, checkpoint: checkpoint.id }),
	).toMatchObject({
		success: false,
		code: "ARCHIVE_NOT_PORTABLE",
		publication: "publication-pending",
	});
	expect(git(remote, "for-each-ref", "--format=%(refname)", destination.ref)).toBe("");
	expect(await readArchitectureCheckpoint(vault, checkpoint.id)).toMatchObject({
		success: true,
		revision: checkpoint.revision,
	});
});

test("a successful archive fetch reports a missing requested identity as unavailable", async () => {
	const { vault, destination } = publicationFixture();
	const checkpoint = await retain(vault);
	await configureArchitecturePublication(vault, destination);
	await publishArchitectureHistory(vault, { ...destination, checkpoint: checkpoint.id });
	expect(
		await fetchArchitectureHistory(vault, { ...destination, checkpoint: "f".repeat(40) }),
	).toMatchObject({ success: false, code: "ARCHITECTURE_UNAVAILABLE", publication: "unavailable" });
});

test("a configured source branch never becomes archive ancestry or changes during publication", async () => {
	const { root, vault, remote } = publicationFixture();
	git(root, "push", "--quiet", "archive", "main:main");
	const head = git(remote, "rev-parse", "refs/heads/main");
	const checkpoint = await retain(vault);
	const destination = { remote: "archive", ref: "refs/heads/main" };
	await configureArchitecturePublication(vault, destination);
	expect(
		await publishArchitectureHistory(vault, { ...destination, checkpoint: checkpoint.id }),
	).toMatchObject({
		success: false,
		code: "ARCHIVE_UNREADABLE",
		publication: "publication-pending",
	});
	expect(git(remote, "rev-parse", "refs/heads/main")).toBe(head);
	expect(git(root, "rev-parse", "archboard-history")).toBe(checkpoint.id);
});
