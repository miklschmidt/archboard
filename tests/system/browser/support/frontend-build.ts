import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import {
	FRONTEND_INPUTS_FILE,
	frontendInputsFingerprint,
} from "../../../../tools/frontend-build-inputs.ts";

type FrontendFreshness = "built" | "current";

interface FrontendBuildRequest {
	executable: "bun";
	argv: string[];
	cwd: string;
	env: Record<string, string | undefined>;
}

type RunFrontendBuild = (request: FrontendBuildRequest) => Promise<void>;

function matchingBuild(repoRoot: string): boolean {
	const record = join(repoRoot, "dist", "frontend", FRONTEND_INPUTS_FILE);
	return (
		existsSync(record) &&
		readFileSync(record, "utf8").trim() === frontendInputsFingerprint(repoRoot)
	);
}

function buildRequest(repoRoot: string): FrontendBuildRequest {
	const fixture = process.env["ARCHBOARD_TEST_BROWSER_BUILD_FIXTURE"];
	if (fixture && (!isAbsolute(fixture) || !existsSync(fixture))) {
		throw new Error("ARCHBOARD_TEST_BROWSER_BUILD_FIXTURE must name an existing absolute file.");
	}
	return {
		executable: "bun",
		argv: fixture ? [fixture] : ["run", "build"],
		cwd: repoRoot,
		env: {
			PATH: process.env["PATH"],
			LANG: "C.UTF-8",
			LC_ALL: "C.UTF-8",
			NO_COLOR: "1",
		},
	};
}

async function ensureFreshFrontend(
	repoRoot: string,
	runBuild: RunFrontendBuild,
): Promise<FrontendFreshness> {
	const bundle = join(repoRoot, "dist/frontend/index.html");
	if (
		!process.env["ARCHBOARD_TEST_BROWSER_BUILD_FIXTURE"] &&
		existsSync(bundle) &&
		matchingBuild(repoRoot)
	) {
		process.stdout.write("# dist/frontend is current for the serial browser lane\n");
		return "current";
	}
	process.stdout.write("# building frontend once for the serial browser lane\n");
	await runBuild(buildRequest(repoRoot));
	if (!existsSync(bundle)) {
		throw new Error("Frontend build did not create dist/frontend/index.html.");
	}
	if (!matchingBuild(repoRoot)) {
		throw new Error(
			"Frontend output does not match its source inputs. Run bunx vp run --no-cache frontend.",
		);
	}
	return "built";
}

export {
	type FrontendFreshness,
	type FrontendBuildRequest,
	type RunFrontendBuild,
	ensureFreshFrontend,
};
