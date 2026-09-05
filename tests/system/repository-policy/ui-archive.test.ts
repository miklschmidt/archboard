import { expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const repoRoot = resolve(import.meta.dir, "../../..");
const archive = ["leg", "acy"].join("");

test("the UI reference archive is ignored and absent from both committed and staged trees", () => {
	for (const cmd of [
		["git", "ls-tree", "-r", "--name-only", "HEAD", "--", archive],
		["git", "ls-files", "--", archive],
	]) {
		const result = Bun.spawnSync(cmd, { cwd: repoRoot, stdout: "pipe", stderr: "pipe" });
		expect(result.exitCode, result.stderr.toString()).toBe(0);
		expect(result.stdout.toString(), "Remove archive content from Git before committing").toBe("");
	}
	const ignored = Bun.spawnSync(["git", "check-ignore", "--no-index", `${archive}/reference.ts`], {
		cwd: repoRoot,
		stdout: "pipe",
		stderr: "pipe",
	});
	expect(ignored.exitCode).toBe(0);
	const bunfig: { test: { pathIgnorePatterns: string[] } } = Bun.TOML.parse(
		readFileSync(join(repoRoot, "bunfig.toml"), "utf8"),
	);
	expect(bunfig.test.pathIgnorePatterns).toEqual([`${archive}/**`]);
	const pkg: { scripts: Record<string, string> } = JSON.parse(
		readFileSync(join(repoRoot, "package.json"), "utf8"),
	);
	for (const [name, command] of Object.entries(pkg.scripts)) {
		if (command.includes("--path-ignore-patterns"))
			expect(command, `${name} overrides Bun's archive ignore`).toContain(
				`--path-ignore-patterns ${archive} `,
			);
	}
});

test("ordinary lint rejects archive imports, re-exports, dynamic loads and serving paths", () => {
	const root = mkdtempSync(join(tmpdir(), "archboard-archive-proof-"));
	try {
		writeFileSync(
			join(root, ".oxlintrc.json"),
			JSON.stringify({
				categories: { correctness: "off" },
				jsPlugins: [join(repoRoot, "tools/oxlint-plugin-archboard.js")],
				rules: { "archboard/no-archive-references": "error" },
			}),
		);
		for (const source of [
			`import "./${archive}/old.ts";`,
			`export * from "./${archive}/old.ts";`,
			`import("./${archive}/old.ts");`,
			`require("./${archive}/old.ts");`,
			`serve(join(root, "${archive}"));`,
			`serve(resolve(root, "${archive}/assets"));`,
			"serve(`./" + archive + "/${name}`);",
		]) {
			const filename = join(root, "entry.ts");
			writeFileSync(filename, source);
			const result = Bun.spawnSync(
				[
					join(repoRoot, "node_modules/.bin/oxlint"),
					"--config",
					join(root, ".oxlintrc.json"),
					filename,
				],
				{ cwd: root, stdout: "pipe", stderr: "pipe" },
			);
			expect(result.exitCode, source).toBe(1);
			expect(result.stdout.toString() + result.stderr.toString()).toContain(
				"no-archive-references",
			);
		}
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
	const config: { rules: Record<string, unknown> } = Bun.JSONC.parse(
		readFileSync(join(repoRoot, ".oxlintrc.jsonc"), "utf8"),
	);
	expect(config.rules["archboard/no-archive-references"]).toBe("error");
});

test("Vite denies the archive while preserving secret-file denials", async () => {
	const { resolveConfig } = await import("vite");
	const config = await resolveConfig(
		{ root: join(repoRoot, "frontend"), configFile: join(repoRoot, "vite.config.js") },
		"serve",
	);
	for (const pattern of [
		".env",
		".env.*",
		"*.{crt,pem,key,p12,pfx,cer,der}",
		".npmrc",
		".yarnrc.yml",
		"**/.git/**",
		`**/${archive}/**`,
	])
		expect(config.server.fs.deny).toContain(pattern);
});

test("Vite refuses archive bytes even inside an otherwise allowed filesystem root", async () => {
	const { createServer } = await import("vite");
	const root = mkdtempSync(join(tmpdir(), "archboard-serving-proof-"));
	let server: Awaited<ReturnType<typeof createServer>> | undefined;
	try {
		mkdirSync(join(root, archive));
		writeFileSync(join(root, archive, "reference.txt"), "archive sentinel");
		server = await createServer({
			root: join(repoRoot, "frontend"),
			configFile: join(repoRoot, "vite.config.js"),
			logLevel: "silent",
			server: { host: "127.0.0.1", port: 0, strictPort: true, fs: { allow: [root] } },
		});
		await server.listen();
		const address = server.httpServer?.address();
		if (!address || typeof address === "string") throw new Error("Vite supplied no TCP address");
		const response = await fetch(
			`http://127.0.0.1:${address.port}/@fs/${join(root, archive, "reference.txt")}`,
		);
		expect(response.status).toBe(403);
		expect(await response.text()).not.toContain("archive sentinel");
	} finally {
		try {
			await server?.close();
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	}
});
