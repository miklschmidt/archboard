import {
	chmodSync,
	existsSync,
	lstatSync,
	readFileSync,
	readdirSync,
	realpathSync,
	statSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const { join, relative } = path;
const packageVaultTempRoot = realpathSync(tmpdir());
const vaultPrefix = `${packageVaultTempRoot}/archboard-task-130-05-package-`;

interface VaultEntry {
	readonly path: string;
	readonly bytes: string;
	readonly mtimeMs: number;
}

function assertOwnedVault(vault: string): string {
	// Darwin cannot realpath a mode-000 file. Resolve its parent while refusing
	// final-component symlinks, so the unreadable-file fixture stays unreadable.
	const info = lstatSync(vault);
	if (info.isSymbolicLink()) {
		throw new Error(`Refusing symlinked package vault: ${vault}`);
	}
	const resolved = join(realpathSync(path.dirname(vault)), path.basename(vault));
	if (!resolved.startsWith(vaultPrefix)) {
		throw new Error(`Refusing unsafe package vault: ${resolved}`);
	}
	return resolved;
}

function snapshotVault(vault: string): VaultEntry[] {
	if (!existsSync(vault)) {
		return [];
	}
	const rootInfo = lstatSync(vault);
	if (!rootInfo.isDirectory()) {
		return [
			{
				path: ".",
				bytes: readFileSync(vault).toString("base64"),
				mtimeMs: statSync(vault).mtimeMs,
			},
		];
	}
	const visit = (directory: string): VaultEntry[] =>
		readdirSync(directory).flatMap((name) => {
			const full = join(directory, name);
			const info = lstatSync(full);
			if (info.isDirectory()) {
				return visit(full);
			}
			return [
				{
					path: relative(vault, full),
					bytes: readFileSync(full).toString("base64"),
					mtimeMs: statSync(full).mtimeMs,
				},
			];
		});
	return visit(vault).toSorted((a: Readonly<VaultEntry>, b: Readonly<VaultEntry>) =>
		a.path.localeCompare(b.path),
	);
}

function snapshotGuardedVault(vault: string): VaultEntry[] {
	const info = lstatSync(vault);
	const mode = info.mode & 0o777;
	if (info.isDirectory() || (mode & 0o400) !== 0) {
		return snapshotVault(vault);
	}
	chmodSync(vault, mode | 0o600);
	try {
		return snapshotVault(vault);
	} finally {
		chmodSync(vault, mode);
	}
}

export {
	assertOwnedVault,
	packageVaultTempRoot,
	snapshotGuardedVault,
	snapshotVault,
	type VaultEntry,
};
