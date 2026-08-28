import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

interface Snapshot {
	path: string;
	existed: boolean;
	bytes?: Buffer;
}

export function plantStaticProbes(repoRoot: string): {
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
	const paths = {
		frontend: join(repoRoot, "dist/frontend", names.frontend),
		stale: join(repoRoot, "dist", names.stale),
		hidden: join(repoRoot, "dist/frontend", names.hidden),
	};
	const snapshots: Snapshot[] = Object.values(paths).map((path) => {
		const existed = existsSync(path);
		return { path, existed, bytes: existed ? readFileSync(path) : undefined };
	});
	for (const snapshot of snapshots) {
		mkdirSync(dirname(snapshot.path), { recursive: true });
		if (snapshot.existed) throw new Error(`Static probe would overwrite ${snapshot.path}.`);
		writeFileSync(snapshot.path, "// TASK-130.09 static probe\n");
	}
	return {
		...names,
		restore() {
			for (const snapshot of snapshots.toReversed()) {
				if (snapshot.existed) writeFileSync(snapshot.path, snapshot.bytes!);
				else rmSync(snapshot.path, { force: true });
			}
		},
	};
}
