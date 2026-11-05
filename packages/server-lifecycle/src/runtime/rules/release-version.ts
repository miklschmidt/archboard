// Does the server run the release that is installed now? (ADR 0075)
//
// A release never changes on disk except by an install, and npm normalizes file times, so the
// module-time check of a checkout says nothing after an upgrade. The version is the identity of a
// release. A server of another version still answers every command, so a difference is a
// warning that names the remedy and not a refusal.

import type { Installation } from "@archboard/workspace/installation";

/** What `/health` says about the installation a server runs. */
interface ServerInstallation {
	readonly mode?: string | undefined;
	readonly version?: string | undefined;
}

/**
 * Whether a server and this process both run a release, which are compared by version and not by
 * location: a release that was upgraded in place has moved to none.
 * @param server What the server says about its installation.
 * @param running The installation of this process.
 * @returns True when both run a release.
 */
function bothRelease(
	server: Pick<ServerInstallation, "mode">,
	running: Pick<Installation, "mode">,
): boolean {
	return running.mode === "release" && server.mode === "release";
}

/**
 * What to tell the person when the server runs another release version than the installed one.
 * @param server What the server says about its installation.
 * @param running The installation of this process.
 * @param address Where a person reaches the server.
 * @returns The warning, or null when no release runs on one side or the versions are equal.
 */
function otherVersionWarning(
	server: ServerInstallation,
	running: Pick<Installation, "mode" | "version">,
	address: string,
): string | null {
	if (!bothRelease(server, running) || server.version === running.version) {
		return null;
	}
	return (
		`The Archboard server at ${address} runs version ${server.version ?? "unknown"}, ` +
		`and the installed version is ${running.version}. ` +
		"Run `archboard restart` so that the server runs the installed version."
	);
}

export { bothRelease, otherVersionWarning, type ServerInstallation };
