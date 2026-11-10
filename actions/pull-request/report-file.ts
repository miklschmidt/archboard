// Report destinations stay inside the workspace, including when a checkout contains symlinks.

import { closeSync, constants, lstatSync, mkdirSync, openSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, sep } from "node:path";

/**
 * Whether a relative path names a file below the workspace.
 * @param path The destination relative to the workspace.
 * @returns True for a nonempty path that stays inside the workspace.
 */
function isWorkspaceFile(path: string): boolean {
	return path !== "" && path !== ".." && !path.startsWith(`..${sep}`) && !isAbsolute(path);
}

/**
 * Write a report inside the workspace without following checkout symlinks.
 * @param workspace The absolute workspace directory.
 * @param file The absolute destination, resolved against the workspace.
 * @param markdown The complete comment body.
 * @throws {Error} When the destination leaves the workspace, uses a symlink, or cannot be written.
 */
function writeReportFile(workspace: string, file: string, markdown: string): void {
	const path = relative(workspace, file);
	const parts = path.split(sep);
	if (!isWorkspaceFile(path)) {
		throw new Error(
			"report-file must name a file inside GITHUB_WORKSPACE. Choose a workspace path.",
		);
	}
	let currentPath = workspace;
	for (const part of parts) {
		currentPath = join(currentPath, part);
		if (lstatSync(currentPath, { throwIfNoEntry: false })?.isSymbolicLink()) {
			throw new Error(
				`report-file cannot use the symlink ${currentPath}. Choose a path without symlinks.`,
			);
		}
	}
	mkdirSync(dirname(file), { recursive: true });
	const descriptor = openSync(
		file,
		constants.O_WRONLY | constants.O_CREAT | constants.O_TRUNC | constants.O_NOFOLLOW,
	);
	try {
		writeFileSync(descriptor, markdown);
	} finally {
		closeSync(descriptor);
	}
}

export { writeReportFile };
