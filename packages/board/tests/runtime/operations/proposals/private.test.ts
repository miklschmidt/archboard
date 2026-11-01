import { afterEach, expect, test } from "bun:test";
import { readArchitectureModel, readArchitectureCheckpoint } from "@archboard/board/store-read";
import {
	initializeArchitectureArchive,
	claimArchitectureSubjects,
	editArchitectureModule,
} from "@archboard/board/store-write";
import { git } from "#tests/runtime/support/publication-fixture.ts";
import {
	untrackedFixture,
	cleanPrivateArchiveFixtures,
} from "#tests/runtime/support/private-archive-fixture.ts";
afterEach(cleanPrivateArchiveFixtures);

test("compact drafts use the existing private archive without a source repository", async () => {
	const { vault } = untrackedFixture();
	const initialized = await initializeArchitectureArchive(vault);
	if (!initialized.success) throw new Error(JSON.stringify(initialized));
	git(initialized.archive, "config", "user.name", "Proposal Author");
	git(initialized.archive, "config", "user.email", "proposal@example.test");
	git(initialized.archive, "config", "commit.gpgsign", "false");
	const current = readArchitectureModel(vault);
	if (!current.success || !current.selectedState) throw new Error(JSON.stringify(current));
	const target = { model: current.manifest.id, state: current.selectedState.id };
	const claimed = await claimArchitectureSubjects(vault, {
		target,
		writer: "agent",
		reason: "planning private architecture",
		subjects: ["Shop", "Shop#Gateway"],
	});
	if (!claimed.success) throw new Error(JSON.stringify(claimed));
	const created = await editArchitectureModule(vault, {
		target,
		writer: "agent",
		claim: claimed.claim.id,
		operationId: "private-draft",
		doing: "proposing private behavior",
		expectedRevision: current.revision,
		proposal: { type: "create", name: "Private plan" },
		changes: [
			{ type: "edit-module", subject: "Shop#Gateway", set: { description: "Queues work." } },
		],
	});
	expect(created).toMatchObject({
		success: true,
		checkpoint: { sources: [], publication: "saved-locally" },
	});
	if (!created.success) throw new Error(JSON.stringify(created));
	const selected = await readArchitectureModel(vault, undefined, undefined, {
		state: "Private plan",
	});
	expect(selected).toMatchObject({ success: true, selectedState: { lifecycle: "draft" } });
	expect(await readArchitectureCheckpoint(vault, created.checkpoint.id)).toMatchObject({
		success: true,
		selectedState: { lifecycle: "draft" },
	});
}, 15_000);
