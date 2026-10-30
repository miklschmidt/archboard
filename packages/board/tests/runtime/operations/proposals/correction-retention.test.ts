import { afterEach, expect, test } from "bun:test";
import { cpSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { readArchitectureModel, readArchitectureCheckpoint } from "@archboard/board/store-read";
import {
	editArchitectureModule,
	configureArchitecturePublication,
	publishArchitectureHistory,
	fetchArchitectureHistory,
} from "@archboard/board/store-write";
import {
	publicationFixture,
	cleanPublicationFixtures,
	git,
	signing,
} from "#tests/runtime/support/publication-fixture.ts";
import { request, proposal, selected } from "#tests/runtime/operations/proposals/fixture.ts";

afterEach(cleanPublicationFixtures);

test("signed corrections preserve source HEAD and index and reopen their dependency closure after publication", async () => {
	const { root, vault, home, key, remote, destination } = publicationFixture();
	const parent = await proposal(vault, "Recorded alternative");
	const shelved = await editArchitectureModule(vault, {
		...(await request(vault, parent.target.state!)),
		proposal: { type: "shelve", reason: "Keep this alternative." },
		changes: [],
	});
	if (!shelved.success) throw new Error(JSON.stringify(shelved));
	const head = git(root, "rev-parse", "HEAD"),
		index = readFileSync(join(root, ".git/index"));
	const intent = {
		...(await request(vault, parent.target.state!)),
		correction: {
			previous: shelved.checkpoint.id,
			reason: "Correct the retained routing description.",
			revisions: [{ repo: "github.com/acme/shop", commit: head }],
		},
		changes: [
			{
				type: "edit-module" as const,
				subject: "Shop#Gateway",
				set: { description: "Accurate historical routing." },
			},
		],
	};
	git(root, "config", "user.signingkey", join(home, "missing-key"));
	expect(await editArchitectureModule(vault, intent)).toMatchObject({
		success: false,
		code: "ARCHIVE_COMMIT_FAILED",
		applied: false,
	});
	expect((await selected(vault, parent.target.state!)).checkpoint?.id).toBe(shelved.checkpoint.id);
	git(root, "config", "user.signingkey", key);
	const corrected = await editArchitectureModule(vault, intent);
	if (!corrected.success) throw new Error(JSON.stringify(corrected));
	expect(git(root, "verify-commit", corrected.checkpoint.id)).toBe("");
	expect(git(root, "rev-parse", "HEAD")).toBe(head);
	expect(readFileSync(join(root, ".git/index"))).toEqual(index);
	expect(await configureArchitecturePublication(vault, destination)).toMatchObject({
		success: true,
	});
	expect(
		await publishArchitectureHistory(vault, {
			...destination,
			checkpoint: corrected.checkpoint.id,
		}),
	).toMatchObject({ success: true, publication: "published" });
	const clone = join(home, "reader");
	git(root, "clone", "--quiet", "--no-checkout", `file://${remote}`, clone);
	git(clone, "remote", "set-url", "origin", "https://github.com/acme/shop.git");
	const copied = join(clone, ".archboard/vault");
	cpSync(vault, copied, { recursive: true });
	signing(clone, key);
	git(clone, "remote", "add", "archive", `file://${remote}`);
	expect(await configureArchitecturePublication(copied, destination)).toMatchObject({
		success: true,
	});
	expect(
		await fetchArchitectureHistory(copied, { ...destination, checkpoint: corrected.checkpoint.id }),
	).toMatchObject({ success: true });
	git(clone, "reflog", "expire", "--expire=now", "--all");
	git(clone, "gc", "--prune=now");
	const logical = await readArchitectureModel(copied, undefined, undefined, {
		state: parent.target.state!,
		compare: false,
	});
	expect(logical).toMatchObject({
		success: true,
		selectedState: { lifecycle: "shelved", corrections: [{ checkpoint: corrected.checkpoint.id }] },
		checkpoint: { sources: [{ repo: "github.com/acme/shop", commit: head, uncommitted: false }] },
	});
	if (!logical.success) throw new Error(JSON.stringify(logical));
	expect(logical.modules.find((module) => module.id === "Shop#Gateway")?.description).toBe(
		"Accurate historical routing.",
	);
	const original = await readArchitectureCheckpoint(
		copied,
		shelved.checkpoint.id,
		undefined,
		undefined,
		{ compare: false },
	);
	if (!original.success) throw new Error(JSON.stringify(original));
	expect(original.modules.find((module) => module.id === "Shop#Gateway")?.description).toBe(
		"Authenticates callers and sends shopping requests to the worker.",
	);
}, 20_000);

test("concurrent corrections remain ambiguous after archive synchronization and both exact readings survive", async () => {
	const { root, vault, home, key, remote, destination } = publicationFixture();
	const parent = await proposal(vault, "Recorded alternative");
	const shelved = await editArchitectureModule(vault, {
		...(await request(vault, parent.target.state!)),
		proposal: { type: "shelve", reason: "Keep the alternative." },
		changes: [],
	});
	if (!shelved.success) throw new Error(JSON.stringify(shelved));
	await configureArchitecturePublication(vault, destination);
	await publishArchitectureHistory(vault, { ...destination, checkpoint: shelved.checkpoint.id });
	const other = join(home, "other");
	git(root, "clone", "--quiet", "--single-branch", "--branch=main", `file://${root}`, other);
	git(other, "remote", "set-url", "origin", "https://github.com/acme/shop.git");
	git(other, "remote", "add", "archive", `file://${remote}`);
	signing(other, key);
	const otherVault = join(other, ".archboard/vault");
	await configureArchitecturePublication(otherVault, destination);
	await fetchArchitectureHistory(otherVault, { ...destination, checkpoint: shelved.checkpoint.id });
	const correction = {
		previous: shelved.checkpoint.id,
		reason: "Correct the recorded source description.",
		revisions: [{ repo: "github.com/acme/shop", commit: git(root, "rev-parse", "HEAD") }],
	};
	const first = await editArchitectureModule(vault, {
		...(await request(vault, parent.target.state!)),
		correction,
		changes: [
			{ type: "edit-module", subject: "Shop#Gateway", set: { description: "Writer A facts." } },
		],
	});
	const second = await editArchitectureModule(otherVault, {
		...(await request(otherVault, parent.target.state!)),
		correction,
		changes: [
			{ type: "edit-module", subject: "Shop#Gateway", set: { description: "Writer B facts." } },
		],
	});
	if (!first.success || !second.success) throw new Error(JSON.stringify({ first, second }));
	expect(
		await publishArchitectureHistory(vault, { ...destination, checkpoint: first.checkpoint.id }),
	).toMatchObject({ success: true });
	expect(
		await publishArchitectureHistory(otherVault, {
			...destination,
			checkpoint: second.checkpoint.id,
		}),
	).toMatchObject({ success: true });
	expect(
		await readArchitectureModel(otherVault, undefined, undefined, {
			state: parent.target.state!,
			compare: false,
		}),
	).toMatchObject({ success: false, code: "STATE_AMBIGUOUS" });
	for (const [checkpoint, description] of [
		[first.checkpoint.id, "Writer A facts."],
		[second.checkpoint.id, "Writer B facts."],
	]) {
		const exact = await readArchitectureCheckpoint(otherVault, checkpoint!, undefined, undefined, {
			compare: false,
		});
		if (!exact.success) throw new Error(JSON.stringify(exact));
		expect(exact.modules.find((module) => module.id === "Shop#Gateway")?.description).toBe(
			description,
		);
	}
}, 30_000);
