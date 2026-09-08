import {
	accessSync,
	chmodSync,
	constants,
	existsSync,
	mkdirSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { userInfo } from "node:os";
import { isAbsolute, join, resolve } from "node:path";

const darwinBrowserExecutables = [
	"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
	"/Applications/Chromium.app/Contents/MacOS/Chromium",
] as const;

class CouldNotRunError extends Error {}

function checkedBrowserExecutable(candidate: string, label: string): string {
	if (!isAbsolute(candidate)) {
		throw new CouldNotRunError(`${label} must be absolute: ${candidate}`);
	}
	const executable = resolve(candidate);
	let stat: ReturnType<typeof statSync>;
	try {
		stat = statSync(executable);
	} catch (error) {
		throw new CouldNotRunError(`${label} does not exist: ${executable}`, {
			cause: error,
		});
	}
	if (!stat.isFile()) {
		throw new CouldNotRunError(`${label} is not a file: ${executable}`);
	}
	try {
		accessSync(executable, constants.X_OK);
	} catch (error) {
		throw new CouldNotRunError(`${label} is not executable: ${executable}`, {
			cause: error,
		});
	}
	return executable;
}

function resolveBrowserExecutable(): string | undefined {
	const configured = process.env["AGENT_BROWSER_EXECUTABLE_PATH"];
	if (configured) return checkedBrowserExecutable(configured, "AGENT_BROWSER_EXECUTABLE_PATH");
	if (process.platform !== "darwin") return undefined;
	for (const candidate of darwinBrowserExecutables) {
		if (existsSync(candidate))
			return checkedBrowserExecutable(candidate, "Discovered macOS browser");
	}
	throw new CouldNotRunError(
		"No supported macOS browser was found; install Google Chrome or Chromium, or set AGENT_BROWSER_EXECUTABLE_PATH.",
	);
}

function shellLiteral(value: string): string {
	return `'${value.replaceAll("'", `'\\''`)}'`;
}

function browserExecutableForLane(
	laneRoot: string,
	browserExecutable: string | undefined,
): string | undefined {
	if (process.platform !== "darwin") return browserExecutable;
	if (!browserExecutable) {
		throw new CouldNotRunError("The macOS browser executable was not resolved before lane setup.");
	}
	const launcher = join(laneRoot, "browser");
	writeFileSync(
		launcher,
		`#!/bin/sh\nHOME=${shellLiteral(userInfo().homedir)} exec ${shellLiteral(browserExecutable)} --no-first-run --no-default-browser-check --use-mock-keychain --password-store=basic "$@"\n`,
		{ mode: 0o700 },
	);
	chmodSync(launcher, 0o700);
	return launcher;
}

function browserProfileForSession(ownerRoot: string, identity: string): string | undefined {
	if (process.platform !== "darwin") return undefined;
	const profile = join(ownerRoot, `browser-profile-${identity}`);
	const defaultProfile = join(profile, "Default");
	mkdirSync(defaultProfile, { recursive: true, mode: 0o700 });
	writeFileSync(
		join(defaultProfile, "Preferences"),
		`${JSON.stringify({ browser: { check_default_browser: false } })}\n`,
		{ mode: 0o600 },
	);
	return profile;
}

export {
	CouldNotRunError,
	browserExecutableForLane,
	browserProfileForSession,
	resolveBrowserExecutable,
};
