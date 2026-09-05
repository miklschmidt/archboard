import fs from "node:fs";
import path from "node:path";

function browserBundleSnapshot(repoRoot: string): {
	exists: boolean;
	mtimeMs?: number;
	size?: number;
} {
	const bundle = path.join(repoRoot, "dist/frontend/index.html");
	if (!fs.existsSync(bundle)) {
		return { exists: false };
	}
	const stat = fs.statSync(bundle);
	return { exists: true, mtimeMs: stat.mtimeMs, size: stat.size };
}

function createBrowserPreflightFixture(): {
	root: string;
	bin: string;
	temporary: string;
	browserExecutable: string;
	versionMarker: string;
	ownerPathMarker: string;
	ownerOperationTimeoutMarker: string;
	canvasOperationTimeoutMarker: string;
	unexpectedMarker: string;
} {
	const root = fs.mkdtempSync(
		path.join(process.env["TMPDIR"] ?? "/tmp", "archboard-browser-preflight-"),
	);
	const bin = path.join(root, "bin");
	const temporary = path.join(root, "tmp");
	try {
		fs.mkdirSync(bin);
		fs.mkdirSync(temporary);
		fs.symlinkSync(process.execPath, path.join(bin, "bun"));
		fs.symlinkSync(process.execPath, path.join(bin, "bunx"));
		fs.symlinkSync(process.execPath, path.join(bin, "node"));
		const browserExecutable = path.join(root, "chrome");
		fs.writeFileSync(browserExecutable, "#!/bin/sh\nexit 0\n", { mode: 0o755 });
		return {
			root,
			bin,
			temporary,
			browserExecutable,
			versionMarker: path.join(root, "agent-browser-version"),
			ownerPathMarker: path.join(root, "owner-browser-path"),
			ownerOperationTimeoutMarker: path.join(root, "owner-operation-timeout"),
			canvasOperationTimeoutMarker: path.join(root, "canvas-operation-timeout"),
			unexpectedMarker: path.join(root, "agent-browser-unexpected"),
		};
	} catch (error) {
		fs.rmSync(root, { recursive: true, force: true });
		throw error;
	}
}

function installFakeAgentBrowser(fixture: ReturnType<typeof createBrowserPreflightFixture>): void {
	const executable = path.join(fixture.bin, "agent-browser");
	fs.writeFileSync(
		executable,
		`#!/bin/sh\nif [ "$1" = "--version" ]; then : > "${fixture.versionMarker}"; exit 0; fi\nprintf '%s' "$AGENT_BROWSER_EXECUTABLE_PATH" > "${fixture.ownerPathMarker}"\nif [ "\${AGENT_BROWSER_DEFAULT_TIMEOUT+x}" = x ]; then printf 'present:%s' "$AGENT_BROWSER_DEFAULT_TIMEOUT"; else printf 'absent'; fi > "${fixture.ownerOperationTimeoutMarker}"\n: > "${fixture.unexpectedMarker}"\nexit 97\n`,
		{ mode: 0o755 },
	);
}

export { browserBundleSnapshot, createBrowserPreflightFixture, installFakeAgentBrowser };
