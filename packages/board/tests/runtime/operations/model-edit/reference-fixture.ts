import { join } from "node:path";
import { readFileSync, writeFileSync } from "node:fs";
import { declareDirectory } from "@archboard/workspace/checkouts";
import { readArchitectureModel } from "@archboard/board/store-read";
import { editArchitectureModule, releaseArchitectureClaim } from "@archboard/board/store-write";
import {
	publicationFixture,
	cleanPublicationFixtures,
	git,
	retain,
} from "#tests/runtime/support/publication-fixture.ts";
import { structureIntent } from "#tests/runtime/operations/model-edit/fixture.ts";

const originalState = process.env["XDG_STATE_HOME"];
const originalRegistry = process.env["ARCHBOARD_REPOS"];
function disposeReferences() {
	if (originalState === undefined) delete process.env["XDG_STATE_HOME"];
	else process.env["XDG_STATE_HOME"] = originalState;
	if (originalRegistry === undefined) delete process.env["ARCHBOARD_REPOS"];
	else process.env["ARCHBOARD_REPOS"] = originalRegistry;
	cleanPublicationFixtures();
}

function isolatedFixture() {
	const fixture = publicationFixture();
	process.env["XDG_STATE_HOME"] = join(fixture.home, "state");
	process.env["ARCHBOARD_REPOS"] = join(fixture.home, "state", "repos.json");
	return fixture;
}

async function referencedFixture() {
	const local = isolatedFixture();
	const foreign = publicationFixture();
	git(foreign.root, "remote", "set-url", "origin", "https://github.com/acme/ledger.git");
	const model = readArchitectureModel(foreign.vault);
	if (!model.success) throw new Error(JSON.stringify(model));
	for (const file of ["model.json", ...model.modules.map((module) => module.file)]) {
		const path = join(foreign.vault, file);
		writeFileSync(path, readFileSync(path, "utf8").replaceAll("Shop", "Ledger"));
	}
	await declareDirectory(foreign.root, { choose: true });
	const checkpoint = await retain(foreign.vault);
	const reference = {
		repo: "github.com/acme/ledger",
		model: "Ledger",
		subject: "Ledger#Gateway",
		state: "current",
	};
	const request = await structureIntent(local.vault, ["Shop#Gateway"]);
	const edited = await editArchitectureModule(local.vault, {
		...request,
		changes: [{ type: "edit-module", subject: "Shop#Gateway", set: { references: [reference] } }],
	});
	if (!edited.success) throw new Error(JSON.stringify(edited));
	await releaseArchitectureClaim(local.vault, { claim: request.claim, writer: request.writer });
	return { local, foreign, reference, checkpoint, edited };
}

export { isolatedFixture, referencedFixture, disposeReferences };
