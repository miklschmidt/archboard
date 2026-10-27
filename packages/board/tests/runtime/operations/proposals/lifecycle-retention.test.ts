import { afterEach, expect, test } from "bun:test";
import { cpSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { readArchitectureModel, readArchitectureCheckpoint } from "@archboard/board/store-read";
import {
	configureArchitecturePublication,
	publishArchitectureHistory,
	fetchArchitectureHistory,
	editArchitectureModule,
} from "@archboard/board/store-write";
import {
	publicationFixture,
	cleanPublicationFixtures,
	git,
	signing,
} from "#tests/runtime/support/publication-fixture.ts";
import { request, proposal } from "#tests/runtime/operations/proposals/fixture.ts";

afterEach(cleanPublicationFixtures);

test.each(["adopt", "shelve"] as const)(
	"signed %s preserves source files and reopens complete history from a local remote",
	async (type) => {
		const { root, vault, home, key, remote, destination } = publicationFixture();
		const created = await proposal(vault, "Queue", "Current", [
			{ type: "edit-module", subject: "Shop#Gateway", set: { description: "Queues work." } },
		]);
		const input = {
			...(await request(vault, created.target.state!)),
			proposal: { type, reason: "Record the queue decision." },
			changes: [],
		};
		const head = git(root, "rev-parse", "HEAD");
		const index = readFileSync(join(root, ".git/index"));
		git(root, "config", "user.signingkey", join(home, "missing-key"));
		expect(await editArchitectureModule(vault, input)).toMatchObject({
			success: false,
			code: "ARCHIVE_COMMIT_FAILED",
			applied: false,
		});
		expect(readArchitectureModel(vault)).toMatchObject({
			success: true,
			revision: input.expectedRevision,
		});
		git(root, "config", "user.signingkey", key);
		const completed = await editArchitectureModule(vault, input);
		if (!completed.success) throw new Error(JSON.stringify(completed));
		expect(git(root, "verify-commit", completed.checkpoint.id)).toBe("");
		expect(git(root, "rev-parse", "HEAD")).toBe(head);
		expect(readFileSync(join(root, ".git/index"))).toEqual(index);
		expect(await configureArchitecturePublication(vault, destination)).toMatchObject({
			success: true,
		});
		expect(
			await publishArchitectureHistory(vault, {
				...destination,
				checkpoint: completed.checkpoint.id,
			}),
		).toMatchObject({ success: true, publication: "published" });
		const clone = join(home, "reader");
		git(root, "clone", "--quiet", "--no-checkout", `file://${remote}`, clone);
		const copiedVault = join(clone, ".archboard/vault");
		cpSync(vault, copiedVault, { recursive: true });
		signing(clone, key);
		git(clone, "remote", "add", "archive", `file://${remote}`);
		expect(await configureArchitecturePublication(copiedVault, destination)).toMatchObject({
			success: true,
		});
		expect(
			await fetchArchitectureHistory(copiedVault, {
				...destination,
				checkpoint: completed.checkpoint.id,
			}),
		).toMatchObject({ success: true });
		git(clone, "reflog", "expire", "--expire=now", "--all");
		git(clone, "gc", "--prune=now");
		const reopened = await readArchitectureCheckpoint(
			copiedVault,
			completed.checkpoint.id,
			undefined,
			undefined,
			{ compare: false },
		);
		expect(reopened).toMatchObject({
			success: true,
			selectedState: {
				id: created.target.state,
				lifecycle: type === "adopt" ? "historical" : "shelved",
			},
			checkpoint: {
				lifecycle: { type },
				sources: [{ repo: "github.com/acme/shop", commit: head }],
			},
		});
		if (!reopened.success) throw new Error(JSON.stringify(reopened));
		expect(reopened.modules.find((module) => module.id === "Shop#Gateway")?.description).toBe(
			"Queues work.",
		);
		expect(
			await readArchitectureCheckpoint(copiedVault, created.checkpoint.id, undefined, undefined, {
				compare: false,
			}),
		).toMatchObject({ success: true, selectedState: { lifecycle: "draft" } });
	},
	20_000,
);
