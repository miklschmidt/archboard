import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const MEMORY_DIRECTORY = "/dev/shm";

/**
 * Whether the memory filesystem can hold a repository whose hooks and signers must run.
 * @returns True on Linux when `/dev/shm` allows execution.
 */
function memoryDirectoryRuns(): boolean {
	if (!existsSync("/proc/mounts")) return false;
	const mount = readFileSync("/proc/mounts", "utf8")
		.split("\n")
		.find((line) => line.split(" ")[1] === MEMORY_DIRECTORY);
	return mount !== undefined && !mount.split(" ")[3]?.split(",").includes("noexec");
}

const parent = memoryDirectoryRuns() ? MEMORY_DIRECTORY : tmpdir();

/**
 * Make a fixture home for a real Git repository.
 *
 * Durable writes and the Bun processes of crash owners cost less on a memory filesystem than in
 * a shared temporary directory. Bun reads each ancestor directory when it starts, and a shared
 * temporary directory can hold thousands of entries.
 * @param prefix The temporary-directory prefix identifying the owner.
 * @returns The new directory.
 */
function temporaryHome(prefix: string): string {
	return mkdtempSync(join(parent, prefix));
}

export { temporaryHome };
