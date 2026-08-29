import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

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
	for (const path of paths)
		if (existsSync(path)) throw new Error(`Static probe target already exists: ${path}.`);
	const created: string[] = [];
	try {
		for (const [index, path] of paths.entries()) {
			mkdirSync(dirname(path), { recursive: true });
			hooks.beforeCreate?.(path, index);
			writeFileSync(path, "// TASK-130.09 static probe\n", { flag: "wx" });
			created.push(path);
		}
	} catch (error) {
		for (const path of created.toReversed()) rmSync(path, { force: true });
		throw error;
	}
	return {
		...names,
		restore() {
			for (const path of created.toReversed()) rmSync(path, { force: true });
		},
	};
}
