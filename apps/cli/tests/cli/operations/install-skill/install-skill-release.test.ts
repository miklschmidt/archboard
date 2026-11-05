import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
	chmodSync,
	lstatSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	readdirSync,
	readlinkSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { resolveInstallation, type Installation } from "@archboard/workspace/installation";
import { installSkills } from "#cli/operations/install-skill/install-skill.ts";
import { resolveExplicitDir } from "#cli/operations/install-skill/skill-destination.ts";

// A release installation can be read-only (a Nix store, a root-owned global install), so
// installing its skills must read from it and write only into the skills root. The fixture
// is a release as the build lays it out, made read-only.

const PREBUILT = "prebuilt by the release build\n";
const diagnostics: string[] = [];
const context = { diagnostic: (message: string) => diagnostics.push(message) };

let workspace: string;
let release: Installation;

/**
 * Every path below a directory with its mode, so that a write into it shows.
 * @param directory The directory.
 * @returns One entry per path.
 */
function snapshot(directory: string): string[] {
	return readdirSync(directory, { recursive: true, withFileTypes: true })
		.map((entry) => {
			const file = path.join(entry.parentPath, entry.name);
			return `${path.relative(directory, file)} ${lstatSync(file).mode.toString(8)}`;
		})
		.toSorted();
}

/**
 * Lets the owner write below a directory again, so that it can be removed.
 * @param directory The directory.
 */
function unlock(directory: string): void {
	chmodSync(directory, 0o755);
	for (const entry of readdirSync(directory, { withFileTypes: true })) {
		if (entry.isDirectory()) unlock(path.join(directory, entry.name));
	}
}

beforeEach(() => {
	diagnostics.length = 0;
	workspace = mkdtempSync(path.join(tmpdir(), "archboard-release-skills-"));
	const root = path.join(workspace, "release");
	for (const [file, contents] of Object.entries({
		"archboard-release.json": JSON.stringify({
			version: "1.2.3",
			commit: "abc123",
			coreSourceHash: "hash",
			codexVersion: "0.0.0",
		}),
		"bin/archboard": "",
		"skills/archboard/SKILL.md": "consumer skill\n",
		"skills/archboard/references/generated/INSTALL.md": PREBUILT,
		"skills/archboard-pr/SKILL.md": "pr skill\n",
	})) {
		mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
		writeFileSync(path.join(root, file), contents);
	}
	release = resolveInstallation({
		executable: path.join(root, "bin", "archboard"),
		moduleDirectory: workspace,
	});
	for (const entry of readdirSync(root, { recursive: true, withFileTypes: true })) {
		const file = path.join(entry.parentPath, entry.name);
		chmodSync(file, entry.isDirectory() ? 0o555 : 0o444);
	}
	chmodSync(root, 0o555);
});

afterEach(() => {
	unlock(workspace);
	rmSync(workspace, { recursive: true, force: true });
});

/**
 * Installs the release's skills the way the command does, without the repository setup.
 * @param dir The skills root.
 * @param repo The repository the install is for.
 * @returns How the skills were installed.
 */
function install(dir: string, repo: string) {
	const request = { dir, repo, printSource: false, noSetup: true, tail: [] };
	return installSkills(request, resolveExplicitDir(dir), release, context);
}

describe("install-skill in a release", () => {
	test("a skills root outside the repository links to the release and writes nothing into it", () => {
		const before = snapshot(release.root);
		const repo = path.join(workspace, "repo");
		mkdirSync(repo);
		const skills = path.join(workspace, "home", ".agents", "skills");

		const { install: how, skills: installed } = install(skills, repo);

		expect(how).toBe("link");
		expect(installed.map((entry) => entry.skill)).toEqual(["archboard", "archboard-pr"]);
		for (const { skill } of installed) {
			expect(readlinkSync(path.join(skills, skill))).toBe(
				path.join(release.skillsDirectory, skill),
			);
		}
		expect(snapshot(release.root)).toEqual(before);
	});

	test("a skills root inside the repository gets a prebuilt copy that a later install replaces", () => {
		const repo = path.join(workspace, "repo");
		const skills = path.join(repo, ".agents", "skills");
		mkdirSync(repo);

		expect(install(skills, repo).install).toBe("copy");
		const copied = path.join(skills, "archboard", "references", "generated", "INSTALL.md");
		expect(lstatSync(path.join(skills, "archboard")).isSymbolicLink()).toBe(false);
		expect(readFileSync(copied, "utf8")).toBe(PREBUILT);
		expect(lstatSync(copied).mode & 0o200).not.toBe(0);

		expect(() => install(skills, repo)).not.toThrow();
		expect(readFileSync(copied, "utf8")).toBe(PREBUILT);
	});
});
