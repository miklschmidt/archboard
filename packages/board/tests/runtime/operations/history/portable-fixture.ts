import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { git, disposeFixtures } from "#tests/runtime/operations/model-edit/fixture.ts";
const destinations: string[] = [];
function cleanPortableFixtures() {
	disposeFixtures();
	for (const root of destinations.splice(0)) rmSync(root, { recursive: true, force: true });
}
function destination() {
	const root = mkdtempSync(join(tmpdir(), "archboard-import-"));
	destinations.push(root);
	const vault = join(root, ".archboard/vault");
	mkdirSync(vault, { recursive: true });
	git(root, "init", "--quiet", "--initial-branch=main");
	git(root, "config", "user.name", "Import Author");
	git(root, "config", "user.email", "import@example.test");
	git(root, "config", "commit.gpgsign", "false");
	return { root, vault };
}
const empty = {
	files: [],
	digest: "4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945",
};

export { destination, empty, cleanPortableFixtures };
