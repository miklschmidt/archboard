import { readFileSync, statSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

interface Snapshot {
	path: string;
	bytes: Buffer;
	mtimeNs: bigint;
}

export interface ReversibleCheckoutEdit {
	edit(path: string, transform: (text: string) => string): void;
	restore(): void;
}

const status = (cwd: string): string => {
	const result = spawnSync("git", ["status", "--short"], { cwd, encoding: "utf8" });
	if (result.status !== 0) throw new Error(result.stderr || "git status failed");
	return result.stdout;
};

const timestamp = (nanoseconds: bigint): string => {
	const billion = 1_000_000_000n;
	return `@${nanoseconds / billion}.${String(nanoseconds % billion).padStart(9, "0")}`;
};

export function reversibleCheckoutEdit(cwd: string, paths: string[]): ReversibleCheckoutEdit {
	const beforeStatus = status(cwd);
	const snapshots = new Map<string, Snapshot>();
	for (const path of paths) {
		const { mtimeNs } = statSync(path, { bigint: true });
		snapshots.set(path, { path, bytes: readFileSync(path), mtimeNs });
	}
	let restored = false;
	return {
		edit(path, transform) {
			const snapshot = snapshots.get(path);
			if (!snapshot) throw new Error(`No reversible snapshot for ${path}.`);
			writeFileSync(path, transform(readFileSync(path, "utf8")));
		},
		restore() {
			if (restored) return;
			for (const snapshot of snapshots.values()) {
				writeFileSync(snapshot.path, snapshot.bytes);
				if (!readFileSync(snapshot.path).equals(snapshot.bytes)) {
					throw new Error(`Failed to restore exact bytes for ${snapshot.path}.`);
				}
				const touched = spawnSync(
					"touch",
					["-m", "-d", timestamp(snapshot.mtimeNs), "--", snapshot.path],
					{ encoding: "utf8" },
				);
				if (touched.status !== 0) {
					throw new Error(
						`Failed to restore exact mtime for ${snapshot.path} with touch (status ${touched.status ?? "null"}): ${touched.stderr.trim() || "no stderr"}`,
					);
				}
				if (statSync(snapshot.path, { bigint: true }).mtimeNs !== snapshot.mtimeNs) {
					throw new Error(`Failed to verify exact mtimeNs for ${snapshot.path}.`);
				}
			}
			if (status(cwd) !== beforeStatus) {
				throw new Error("Checkout status changed after reversible source restoration.");
			}
			restored = true;
		},
	};
}
