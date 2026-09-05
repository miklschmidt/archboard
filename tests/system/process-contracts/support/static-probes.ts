import { existsSync, mkdirSync, rmSync, rmdirSync, writeFileSync } from "node:fs";
import path from "node:path";

export interface StaticProbeHooks {
	readonly beforeCreate?: (path: string, index: number) => void;
}

export function plantStaticProbes(
	repoRoot: string,
	hooks: Readonly<StaticProbeHooks> = {},
): {
	frontend: string;
	stale: string;
	hidden: string;
	readonly restore: () => void;
} {
	const { join } = path;
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
	for (const probePath of paths) {
		if (existsSync(probePath)) {
			throw new Error(`Static probe target already exists: ${probePath}.`);
		}
	}
	const created: string[] = [];
	const createdDirectories: string[] = [];
	const clean = (): void => {
		for (const probePath of created.toReversed()) {
			rmSync(probePath, { force: true });
		}
		for (const directory of createdDirectories.toReversed()) {
			try {
				rmdirSync(directory);
			} catch (error) {
				const code =
					typeof error === "object" && error !== null && "code" in error
						? error.code
						: undefined;
				if (code !== "ENOENT" && code !== "ENOTEMPTY") {
					throw error;
				}
			}
		}
	};
	try {
		for (const directory of directories) {
			if (!existsSync(directory)) {
				mkdirSync(directory);
				createdDirectories.push(directory);
			}
		}
		for (const [index, probePath] of paths.entries()) {
			hooks.beforeCreate?.(probePath, index);
			writeFileSync(probePath, "// TASK-130.09 static probe\n", { flag: "wx" });
			created.push(probePath);
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
