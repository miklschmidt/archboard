// Which Archboard this process is, and where its parts are (ADR 0076).
//
// Archboard runs in one of two ways. A checkout runs its source with Bun
// (ADR 0014). A release runs one compiled executable, with the frontend, the
// core and the skills in files beside it. This module decides
// the mode once, and every other module asks it for a location instead of
// looking for the root on its own.
//
// The mode is release when `archboard-release.json` lies beside the running
// executable: in its directory, or in the parent of a `bin/` directory that
// holds it, which is how a platform package is laid out. Otherwise the mode is
// checkout when an archboard checkout is above this file. Otherwise the
// process refuses.

import fs from "fs";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";
import { z } from "zod";
import { codedError } from "@archboard/diagnostics/thrown-error";

/** The file that makes an installation a release. A release build writes it. */
const RELEASE_MARKER = "archboard-release.json";

/** The CLI's entry point, relative to a checkout root. */
const CHECKOUT_BIN = path.join("bin", "archboard");

/** The server's entry, relative to a checkout root. */
const SERVER_ENTRY = path.join("apps", "server", "src", "server.ts");

/**
 * The first argument with which a release executable runs the server in place
 * of the CLI (ADR 0076): `apps/cli/src/bin.ts` then imports the server's entry.
 */
const RELEASE_SERVER_ARGUMENT = "--internal-server";

/** What a release build records about itself. */
const releaseMarker = z.object({
	version: z.string(),
	commit: z.string(),
	coreSourceHash: z.string(),
	codexVersion: z.string(),
});

/** Where the hash of the core sources that the running core must match comes from. */
type CoreHashSource =
	/** Hash the sources of this checkout, as a build of the core did. */
	| { readonly kind: "sources"; readonly root: string }
	/** The hash a release build recorded in its marker. */
	| { readonly kind: "marker"; readonly hash: string };

/** The installation this process runs, and the locations of its parts. */
interface Installation {
	readonly mode: "checkout" | "release";
	/** The real path of the checkout, or of the platform package of a release. */
	readonly root: string;
	/** The `version` of the checkout's package.json, or of the release marker. */
	readonly version: string;
	/** The browser bundle that the server serves. */
	readonly frontendDirectory: string;
	/** The renderer core's build: the glue and the WebAssembly. */
	readonly coreDirectory: string;
	/** The directory that holds the `archboard`, `archboard-pr` and `archboard-plan` skills. */
	readonly skillsDirectory: string;
	/** The directory of the `archboard` executable, which a Codex child gets first on its PATH. */
	readonly binDirectory: string;
	/**
	 * Where the pinned Codex lies, in the terms of `resolveCodexExecutable`: under the checkout's
	 * `node_modules`, or in the platform package of a release.
	 */
	readonly codexLocation: { readonly installedIn: string } | { readonly releasedIn: string };
	/**
	 * The directory below which the program's own modules lie at their paths in a checkout: the
	 * checkout root, or the root of the file system that a release executable embeds, the directory
	 * of `Bun.main`. `scripts/release/compile.ts` compiles every module that starts on its own, the
	 * server and the layout worker, with the repository as its root.
	 */
	readonly programRoot: string;
	/**
	 * The executable and arguments that start the server. A release starts its own executable
	 * with `--internal-server`, which then imports `serverModule` and runs no command.
	 */
	readonly serverCommand: readonly [string, ...string[]];
	/** The URL of the server's entry below `programRoot`. */
	readonly serverModule: string;
	readonly coreHash: CoreHashSource;
}

/** Where a process runs from. */
interface InstallationStart {
	/** The running executable: `process.execPath`. */
	readonly executable: string;
	/** The directory of the module that asks, for the checkout rule. */
	readonly moduleDirectory: string;
}

/**
 * Whether a checkout is archboard: its package is named `archboard` and it has
 * the CLI's entry point.
 * @param root The checkout root.
 * @returns True for an archboard checkout.
 */
function isArchboardCheckout(root: string): boolean {
	try {
		const manifest: unknown = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
		return (
			typeof manifest === "object" &&
			manifest !== null &&
			Reflect.get(manifest, "name") === "archboard" &&
			fs.existsSync(path.join(root, CHECKOUT_BIN))
		);
	} catch {
		return false;
	}
}

/**
 * The real path of the nearest archboard checkout at or above a directory.
 * @param directory Where to start.
 * @returns The checkout's real path, or null when none is above the directory.
 */
function checkoutAbove(directory: string): string | null {
	for (let current = path.resolve(directory); ; current = path.dirname(current)) {
		if (isArchboardCheckout(current)) {
			return fs.realpathSync(current);
		}
		if (path.dirname(current) === current) {
			return null;
		}
	}
}

/**
 * The directory that holds the release marker for an executable.
 * @param executable The running executable.
 * @returns The real path of that directory, or null when the executable is no release.
 */
function releaseRootOf(executable: string): string | null {
	let beside: string;
	try {
		beside = path.dirname(fs.realpathSync(executable));
	} catch {
		return null;
	}
	const candidates = path.basename(beside) === "bin" ? [beside, path.dirname(beside)] : [beside];
	return (
		candidates.find((directory) => fs.existsSync(path.join(directory, RELEASE_MARKER))) ?? null
	);
}

/**
 * Describe a release from its marker.
 * @param root The directory that holds the marker.
 * @param executable The running executable.
 * @returns The release.
 * @throws {Error} `RELEASE_MARKER_INVALID` when the marker is unreadable or incomplete.
 */
function releaseAt(root: string, executable: string): Installation {
	const file = path.join(root, RELEASE_MARKER);
	const parsed = (() => {
		try {
			return releaseMarker.safeParse(JSON.parse(fs.readFileSync(file, "utf8")));
		} catch {
			return null;
		}
	})();
	if (parsed === null || !parsed.success) {
		throw codedError(
			`${file} is not a readable Archboard release marker. This installation is damaged. ` +
				"Reinstall Archboard, then run the command again.",
			"RELEASE_MARKER_INVALID",
		);
	}
	const programRoot = path.dirname(Bun.main);
	return {
		mode: "release",
		root,
		version: parsed.data.version,
		frontendDirectory: path.join(root, "frontend"),
		coreDirectory: path.join(root, "core"),
		skillsDirectory: path.join(root, "skills"),
		binDirectory: path.dirname(fs.realpathSync(executable)),
		codexLocation: { releasedIn: root },
		programRoot,
		serverCommand: [executable, RELEASE_SERVER_ARGUMENT],
		serverModule: pathToFileURL(path.join(programRoot, SERVER_ENTRY)).href,
		coreHash: { kind: "marker", hash: parsed.data.coreSourceHash },
	};
}

/**
 * The `version` of a checkout's package.json.
 * @param root The checkout root.
 * @returns The version, or "unknown" when the manifest cannot be read.
 */
function checkoutVersion(root: string): string {
	try {
		const manifest = z
			.object({ version: z.string() })
			.parse(JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8")));
		return manifest.version;
	} catch {
		return "unknown";
	}
}

/**
 * Describe a checkout.
 * @param root The checkout's real path.
 * @param executable The running executable, which runs the server's TypeScript.
 * @returns The checkout.
 */
function checkoutAt(root: string, executable: string): Installation {
	return {
		mode: "checkout",
		root,
		version: checkoutVersion(root),
		frontendDirectory: path.join(root, "dist", "frontend"),
		coreDirectory: path.join(
			root,
			"packages",
			"renderer",
			"src",
			"shared",
			"protocol",
			"generated",
			"core",
		),
		skillsDirectory: path.join(root, "skills"),
		binDirectory: path.join(root, "bin"),
		codexLocation: { installedIn: root },
		programRoot: root,
		serverCommand: [executable, path.join(root, SERVER_ENTRY)],
		serverModule: pathToFileURL(path.join(root, SERVER_ENTRY)).href,
		coreHash: { kind: "sources", root },
	};
}

/**
 * Decide the installation a process runs: release, else checkout, else refusal.
 * @param start Where the process runs from.
 * @returns The installation.
 * @throws {Error} `RELEASE_MARKER_INVALID` for a damaged release, or
 * `INSTALLATION_NOT_FOUND` when the process is neither a release nor in a checkout.
 */
function resolveInstallation(start: InstallationStart): Installation {
	const releaseRoot = releaseRootOf(start.executable);
	if (releaseRoot !== null) {
		return releaseAt(releaseRoot, start.executable);
	}
	const checkout = checkoutAbove(start.moduleDirectory);
	if (checkout !== null) {
		return checkoutAt(checkout, start.executable);
	}
	throw codedError(
		`${start.executable} is no Archboard installation: ${RELEASE_MARKER} is not beside it, ` +
			`and ${start.moduleDirectory} is not inside an archboard checkout. ` +
			"Run archboard from a checkout, or reinstall the release.",
		"INSTALLATION_NOT_FOUND",
	);
}

let decided: Installation | undefined;

/**
 * The installation this process runs, decided on the first call.
 * @returns The installation.
 * @throws {Error} `RELEASE_MARKER_INVALID` or `INSTALLATION_NOT_FOUND`, as `resolveInstallation`.
 */
function installation(): Installation {
	decided ??= resolveInstallation({
		executable: process.execPath,
		moduleDirectory: path.dirname(fileURLToPath(import.meta.url)),
	});
	return decided;
}

export {
	CHECKOUT_BIN,
	installation,
	isArchboardCheckout,
	RELEASE_MARKER,
	RELEASE_SERVER_ARGUMENT,
	resolveInstallation,
};
export type { CoreHashSource, Installation };
