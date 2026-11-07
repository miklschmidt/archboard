// How a process decides which Archboard it is (ADR 0076): a release when
// `archboard-release.json` lies beside the executable, else the checkout above
// the module, else a refusal. The tests build stand-ins in a temporary directory.

import { afterAll, beforeAll, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	installation,
	RELEASE_MARKER,
	resolveInstallation,
} from "#runtime/services/installation.ts";

let scratch = "";

beforeAll(() => {
	scratch = realpathSync.native(mkdtempSync(join(tmpdir(), "archboard-installation-")));
});

afterAll(() => {
	rmSync(scratch, { recursive: true, force: true });
});

const MARKER = {
	version: "1.2.3",
	commit: "abc123",
	coreSourceHash: "0123456789abcdef",
	codexVersion: "0.160.0",
};

/**
 * Make a directory of a stand-in archboard checkout.
 * @param name Its directory name below the scratch directory.
 * @returns Its root.
 */
function checkout(name: string): string {
	const root = join(scratch, name);
	mkdirSync(join(root, "bin"), { recursive: true });
	mkdirSync(join(root, "packages", "workspace"), { recursive: true });
	writeFileSync(
		join(root, "package.json"),
		JSON.stringify({ name: "archboard", version: "9.9.9" }),
	);
	writeFileSync(join(root, "bin", "archboard"), "#!/usr/bin/env bash\n");
	return root;
}

/**
 * Make a platform package of a release: `bin/archboard` and the marker at its root.
 * @param name Its directory name below the scratch directory.
 * @param marker What the marker file holds.
 * @returns Its root.
 */
function release(name: string, marker: string = JSON.stringify(MARKER)): string {
	const root = join(scratch, name);
	mkdirSync(join(root, "bin"), { recursive: true });
	writeFileSync(join(root, "bin", "archboard"), "");
	writeFileSync(join(root, RELEASE_MARKER), marker);
	return root;
}

test("the running source is the checkout that holds packages/ and apps/, not the package", () => {
	// This file is packages/workspace/tests/runtime/services/ below the checkout.
	const found = installation();
	expect(found.mode).toBe("checkout");
	expect(found.root).toBe(realpathSync(join(import.meta.dir, "..", "..", "..", "..", "..")));
	expect(existsSync(join(found.root, "packages", "workspace", "package.json"))).toBe(true);
	expect(existsSync(join(found.root, "apps", "cli", "src", "bin.ts"))).toBe(true);
});

test("a checkout names the places the source and its build keep their parts", () => {
	const root = checkout("a-checkout");
	const found = resolveInstallation({
		executable: "/usr/bin/bun",
		moduleDirectory: join(root, "packages", "workspace"),
	});
	expect(found).toMatchObject({
		mode: "checkout",
		root,
		version: "9.9.9",
		frontendDirectory: join(root, "dist", "frontend"),
		skillsDirectory: join(root, "skills"),
		binDirectory: join(root, "bin"),
		codexLocation: { installedIn: root },
		serverCommand: ["/usr/bin/bun", join(root, "apps", "server", "src", "server.ts")],
		coreHash: { kind: "sources", root },
	});
	expect(found.coreDirectory.startsWith(join(root, "packages", "renderer"))).toBe(true);
});

test("a release is found by its marker beside the executable, and its parts lie in its root", () => {
	const root = release("a-release");
	const found = resolveInstallation({
		executable: join(root, "bin", "archboard"),
		moduleDirectory: "/$bunfs/root",
	});
	expect(found).toMatchObject({
		mode: "release",
		root,
		version: "1.2.3",
		frontendDirectory: join(root, "frontend"),
		coreDirectory: join(root, "core"),
		skillsDirectory: join(root, "skills"),
		binDirectory: join(root, "bin"),
		coreHash: { kind: "marker", hash: MARKER.coreSourceHash },
	});
	expect(found.serverCommand[0]).toBe(join(root, "bin", "archboard"));
});

test("a marker in the executable's own directory also makes a release", () => {
	const root = join(scratch, "flat-release");
	mkdirSync(root);
	writeFileSync(join(root, "archboard"), "");
	writeFileSync(join(root, RELEASE_MARKER), JSON.stringify(MARKER));
	const found = resolveInstallation({
		executable: join(root, "archboard"),
		moduleDirectory: "/$bunfs/root",
	});
	expect(found).toMatchObject({ mode: "release", root, binDirectory: root });
});

test("the marker wins over a checkout above the module", () => {
	const root = release("release-in-checkout");
	const inside = checkout("checkout-of-release");
	const found = resolveInstallation({
		executable: join(root, "bin", "archboard"),
		moduleDirectory: join(inside, "packages", "workspace"),
	});
	expect(found.mode).toBe("release");
});

test("a damaged marker refuses with a code, and does not fall back to the checkout", () => {
	const root = release("damaged-release", JSON.stringify({ version: "1.2.3" }));
	const inside = checkout("checkout-of-damaged");
	expect(() =>
		resolveInstallation({
			executable: join(root, "bin", "archboard"),
			moduleDirectory: join(inside, "packages", "workspace"),
		}),
	).toThrow(expect.objectContaining({ code: "RELEASE_MARKER_INVALID" }));
});

test("without a marker and a checkout the process refuses with a code", () => {
	const bare = join(scratch, "bare");
	mkdirSync(join(bare, "bin"), { recursive: true });
	writeFileSync(join(bare, "bin", "archboard"), "");
	expect(() =>
		resolveInstallation({ executable: join(bare, "bin", "archboard"), moduleDirectory: bare }),
	).toThrow(expect.objectContaining({ code: "INSTALLATION_NOT_FOUND" }));
});
