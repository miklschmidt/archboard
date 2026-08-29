import { existsSync, readdirSync, statSync } from "node:fs";
import { spawn } from "node:child_process";
import { join } from "node:path";

export type FrontendFreshness = "built" | "current";

const INPUT_DIRECTORIES = ["frontend", "src"] as const;
const INPUT_FILES = [
	"vite.config.js",
	"tsconfig.frontend.json",
	"package.json",
	"bun.lock",
] as const;

function sourceFiles(repoRoot: string): string[] {
	const files: string[] = [];
	for (const relative of INPUT_DIRECTORIES) {
		const root = join(repoRoot, relative);
		if (!existsSync(root)) continue;
		const queue = [root];
		while (queue.length > 0) {
			const directory = queue.pop();
			if (!directory) continue;
			for (const entry of readdirSync(directory, { withFileTypes: true })) {
				const absolute = join(directory, entry.name);
				if (entry.isDirectory()) queue.push(absolute);
				else if (entry.isFile()) files.push(absolute);
			}
		}
	}
	for (const relative of INPUT_FILES) {
		const absolute = join(repoRoot, relative);
		if (existsSync(absolute)) files.push(absolute);
	}
	return files;
}

function runBuild(repoRoot: string): Promise<void> {
	return new Promise((resolve, reject) => {
		const child = spawn(process.execPath, ["run", "build"], {
			cwd: repoRoot,
			env: {
				PATH: process.env.PATH,
				LANG: "C.UTF-8",
				LC_ALL: "C.UTF-8",
				NO_COLOR: "1",
			},
			stdio: "inherit",
		});
		child.once("error", (error) =>
			reject(new Error("Could not start the frontend build.", { cause: error })),
		);
		child.once("exit", (code, signal) => {
			if (code === 0) resolve();
			else {
				const exit = signal ? `signal ${signal}` : `exit ${code ?? "unknown"}`;
				reject(new Error(`Frontend build ended with ${exit}.`));
			}
		});
	});
}

export async function ensureFreshFrontend(repoRoot: string): Promise<FrontendFreshness> {
	const bundle = join(repoRoot, "dist/frontend/index.html");
	const inputs = sourceFiles(repoRoot);
	const newestInput = inputs.reduce((newest, file) => Math.max(newest, statSync(file).mtimeMs), 0);
	const builtAt = existsSync(bundle) ? statSync(bundle).mtimeMs : 0;
	let decision: FrontendFreshness = "current";
	if (builtAt < newestInput) {
		decision = "built";
		process.stdout.write("# building frontend once for the serial browser lane\n");
		await runBuild(repoRoot);
	} else {
		process.stdout.write("# dist/frontend is current for the serial browser lane\n");
	}
	if (!existsSync(bundle))
		throw new Error("Frontend build did not create dist/frontend/index.html.");
	const finalBuiltAt = statSync(bundle).mtimeMs;
	const stale = inputs.find((file) => statSync(file).mtimeMs > finalBuiltAt);
	if (stale) throw new Error(`dist/frontend/index.html is older than ${stale}.`);
	return decision;
}
