import { expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ensureFreshFrontend } from "../browser/support/frontend-build.ts";
import {
	FRONTEND_INPUTS_FILE,
	frontendInputsFingerprint,
} from "../../../tools/frontend-build-inputs.ts";

async function withBuild(run: (root: string, source: string) => Promise<void>): Promise<void> {
	const root = mkdtempSync(join(tmpdir(), "archboard-frontend-build-"));
	try {
		mkdirSync(join(root, "apps", "web", "src"), { recursive: true });
		mkdirSync(join(root, "dist", "frontend"), { recursive: true });
		const source = join(root, "apps", "web", "src", "main.ts");
		writeFileSync(source, "export const version = 1;\n");
		await run(root, source);
	} finally {
		rmSync(root, { recursive: true });
	}
}

function build(root: string): void {
	writeFileSync(join(root, "dist", "frontend", "index.html"), "<html></html>\n");
	writeFileSync(
		join(root, "dist", "frontend", FRONTEND_INPUTS_FILE),
		frontendInputsFingerprint(root),
	);
}

test("a restored build stays current when only source modification times change", async () => {
	await withBuild(async (root, source) => {
		build(root);
		utimesSync(join(root, "dist", "frontend", "index.html"), 0, 0);
		utimesSync(source, new Date(), new Date());
		expect(
			await ensureFreshFrontend(root, async () => {
				throw new Error("A matching restored build must be reused");
			}),
		).toBe("current");
	});
});

test("changed source bytes rebuild even when their modification time is old", async () => {
	await withBuild(async (root, source) => {
		build(root);
		writeFileSync(source, "export const version = 2;\n");
		utimesSync(source, 0, 0);
		let calls = 0;
		expect(
			await ensureFreshFrontend(root, async () => {
				calls += 1;
				build(root);
			}),
		).toBe("built");
		expect(calls).toBe(1);
	});
});

test("a successful command that leaves an old build is refused", async () => {
	await withBuild(async (root, source) => {
		build(root);
		writeFileSync(source, "export const version = 2;\n");
		await expect(ensureFreshFrontend(root, async () => {})).rejects.toThrow();
	});
});

test("a command that creates no bundle is refused", async () => {
	await withBuild(async (root) => {
		await expect(ensureFreshFrontend(root, async () => {})).rejects.toThrow();
	});
});

test("a failed build preserves its failure", async () => {
	await withBuild(async (root) => {
		const failure = new Error("build failed");
		await expect(
			ensureFreshFrontend(root, async () => {
				throw failure;
			}),
		).rejects.toBe(failure);
	});
});

test("a source change during the build leaves the build refused", async () => {
	await withBuild(async (root, source) => {
		await expect(
			ensureFreshFrontend(root, async () => {
				build(root);
				writeFileSync(source, "export const version = 2;\n");
			}),
		).rejects.toThrow();
	});
});
