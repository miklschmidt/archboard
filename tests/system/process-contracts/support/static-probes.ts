import { existsSync, mkdirSync, rmSync, rmdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export interface StaticProbeHooks {
	beforeCreate?(path: string, index: number): void;
}

export function plantStaticProbes(
	repoRoot: string,
	hooks: StaticProbeHooks = {},
): {
	frontend: string;
	stale: string;
	hidden: string;
	restore(): void;
} {
	const names = {
		frontend: "task-130-09-frontend-probe.js",
		stale: "task-130-09-stale-probe.js",
		hidden: ".task-130-09-hidden-probe.js",
	};
	const paths = [
		join(repoRoot, "dist/frontend", names.frontend),
		join(repoRoot, "dist", names.stale),
		join(repoRoot, "dist/frontend", names.hidden),
	];
	const directories = [join(repoRoot, "dist"), join(repoRoot, "dist/frontend")];
	for (const path of paths)
		if (existsSync(path)) throw new Error(`Static probe target already exists: ${path}.`);
	const created: string[] = [];
	const createdDirectories: string[] = [];
	const clean = () => {
		for (const path of created.toReversed()) rmSync(path, { force: true });
		for (const directory of createdDirectories.toReversed()) {
			try {
				rmdirSync(directory);
			} catch (error) {
				if (
					(error as NodeJS.ErrnoException).code !== "ENOENT" &&
					(error as NodeJS.ErrnoException).code !== "ENOTEMPTY"
				)
					throw error;
			}
		}
	};
	try {
		for (const directory of directories)
			if (!existsSync(directory)) {
				mkdirSync(directory);
				createdDirectories.push(directory);
			}
		for (const [index, path] of paths.entries()) {
			hooks.beforeCreate?.(path, index);
			writeFileSync(path, "// TASK-130.09 static probe\n", { flag: "wx" });
			created.push(path);
		}
	} catch (error) {
		clean();
		throw error;
	}
	return {
		...names,
		restore() {
			clean();
		},
	};
}
