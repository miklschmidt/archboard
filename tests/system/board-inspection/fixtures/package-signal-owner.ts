import { createPackageInspectionOwner } from "../support/package-inspection.js";
import { TEST_BOARD_INSPECTION_PACKAGE_FAILURE_TIMEOUT_MS } from "../../support/timing.ts";

const owner = createPackageInspectionOwner();
const vault = owner.startVault();
let capturedSignals = 0;
try {
	const delayedStartup = process.env["ARCHBOARD_PACKAGE_SIGNAL_DELAYED_STARTUP"] === "1";
	const startingSentinel = owner.startHttpSentinel({
		resistTermination: true,
		...(delayedStartup
			? { startupDelayMs: TEST_BOARD_INSPECTION_PACKAGE_FAILURE_TIMEOUT_MS * 5 }
			: {}),
	});
	if (delayedStartup) {
		await owner.pendingSentinelOwnership();
	}
	const sentinelIdentity = owner.pendingSentinelIdentity();
	if (sentinelIdentity === undefined) {
		throw new Error("Package signal owner did not capture sentinel identity.");
	}
	const sentinel = delayedStartup ? undefined : await startingSentinel;
	const fixtures = delayedStartup ? [] : [owner.startSignalFixture(), owner.startSignalFixture()];
	const ready: Promise<unknown>[] = [];
	for (const fixture of fixtures) {
		ready.push(fixture.ready);
	}
	const identities = await Promise.all(ready);
	owner.onSignalCaptured((signal) => {
		capturedSignals += 1;
		if (capturedSignals === 1) {
			process.kill(process.pid, signal);
		}
	});
	owner.onBeforeSignalReplay(() => {
		const settlements: unknown[] = [];
		for (const fixture of fixtures) {
			settlements.push(fixture.settled());
		}
		process.stdout.write(
			`${JSON.stringify({
				shutdown: true,
				capturedSignals,
				settlements,
				remainingArtifacts: owner.artifactPaths(),
			})}\n`,
		);
	});
	process.stdout.write(
		`${JSON.stringify({
			owner: process.pid,
			vault,
			identities,
			sentinel: sentinel?.identity ?? sentinelIdentity,
			artifacts: owner.artifactPaths(),
		})}\n`,
	);
	if (delayedStartup) {
		await startingSentinel;
	}
	const results: Promise<unknown>[] = [];
	for (const fixture of fixtures) {
		results.push(fixture.result);
	}
	await Promise.all(results);
	throw new Error("Package signal fixture completed without an interrupt.");
} finally {
	await owner.dispose();
}
