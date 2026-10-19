import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import {
	copyFileSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

const generator = resolve(
	import.meta.dir,
	"../../../scripts/generate-codex-app-server-contract.ts",
);
const legacyFolders = ["src", "src/shared", "src/shared/codex-app-server-contract"];
const legacyGenerated = "src/shared/codex-app-server-contract/generated";

function fixture() {
	const root = mkdtempSync(join(tmpdir(), "archboard-contract-cleanup-"));
	const checkout = join(root, "checkout");
	const script = join(checkout, "scripts/generate-codex-app-server-contract.ts");
	mkdirSync(dirname(script), { recursive: true });
	copyFileSync(generator, script);
	return {
		root,
		checkout,
		run: () =>
			spawnSync(process.execPath, [script, "--ensure"], {
				cwd: checkout,
				encoding: "utf8",
			}),
		[Symbol.dispose]: () => rmSync(root, { recursive: true, force: true }),
	};
}

test.each([null, ...legacyFolders])(
	"legacy contract cleanup removes only empty parents (retained: %s)",
	(retained) => {
		using world = fixture();
		const generated = join(world.checkout, legacyGenerated);
		mkdirSync(generated, { recursive: true });
		writeFileSync(join(generated, "old.ts"), "old generated contract");
		const sentinel = retained === null ? null : join(world.checkout, retained, "keep.ts");
		if (sentinel !== null) writeFileSync(sentinel, "authored source");

		// No Codex package is installed in the fixture: after cleanup, generation
		// refuses instead of launching Codex or writing any new contract.
		expect(world.run().status).toBe(1);
		expect(existsSync(generated)).toBeFalse();
		if (sentinel === null) {
			expect(existsSync(join(world.checkout, "src"))).toBeFalse();
		} else {
			expect(readFileSync(sentinel, "utf8")).toBe("authored source");
		}
	},
);

test.each([...legacyFolders, legacyGenerated])(
	"legacy contract cleanup refuses a symlink at %s before deleting outside the checkout",
	(link) => {
		using world = fixture();
		const outside = join(world.root, "outside");
		const suffix = legacyGenerated.slice(link.length);
		const generated = `${outside}${suffix}`;
		mkdirSync(generated, { recursive: true });
		const sentinel = join(generated, "keep.ts");
		writeFileSync(sentinel, "outside checkout");
		const linked = join(world.checkout, link);
		mkdirSync(dirname(linked), { recursive: true });
		symlinkSync(outside, linked, "dir");

		expect(world.run().status).toBe(1);
		expect(readFileSync(sentinel, "utf8")).toBe("outside checkout");
	},
);
