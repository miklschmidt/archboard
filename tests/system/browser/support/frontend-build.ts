import { existsSync, readdirSync, statSync } from "node:fs";
import { isAbsolute, join } from "node:path";

export type FrontendFreshness = "built" | "current";

export interface FrontendBuildRequest {
	executable: "bun";
	argv: string[];
	cwd: string;
	env: Record<string, string | undefined>;
}

export type RunFrontendBuild = (request: FrontendBuildRequest) => Promise<void>;

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

function buildRequest(repoRoot: string): FrontendBuildRequest {
	const fixture = process.env.ARCHBOARD_TEST_BROWSER_BUILD_FIXTURE;
	if (fixture && (!isAbsolute(fixture) || !existsSync(fixture))) {
		throw new Error("ARCHBOARD_TEST_BROWSER_BUILD_FIXTURE must name an existing absolute file.");
	}
	return {
		executable: "bun",
		argv: fixture ? [fixture] : ["run", "build"],
		cwd: repoRoot,
		env: {
			PATH: process.env.PATH,
			LANG: "C.UTF-8",
			LC_ALL: "C.UTF-8",
			NO_COLOR: "1",
		},
	};
}

export async function ensureFreshFrontend(
	repoRoot: string,
	runBuild: RunFrontendBuild,
): Promise<FrontendFreshness> {
	const bundle = join(repoRoot, "dist/frontend/index.html");
	const inputs = sourceFiles(repoRoot);
	const newestInput = inputs.reduce((newest, file) => Math.max(newest, statSync(file).mtimeMs), 0);
	const builtAt = existsSync(bundle) ? statSync(bundle).mtimeMs : 0;
	let decision: FrontendFreshness = "current";
	if (builtAt < newestInput || process.env.ARCHBOARD_TEST_BROWSER_BUILD_FIXTURE) {
		decision = "built";
		process.stdout.write("# building frontend once for the serial browser lane\n");
		await runBuild(buildRequest(repoRoot));
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
