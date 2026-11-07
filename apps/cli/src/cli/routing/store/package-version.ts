import { installation } from "@archboard/workspace/installation";

/**
 * The version of the installation that runs: the package.json of a checkout, or the marker of a
 * release. The CLI's `--version` reads it so it can never drift from what is published.
 * @returns The version string, or "unknown" when a checkout's manifest cannot be read.
 */
export function packageVersion(): string {
	return installation().version;
}
