import { expect, test } from "bun:test";

import {
	createCodexThreadLink,
	createCodexThreadLinkBinding,
	createCodexThreadLinkClassifier,
	discoverCodexThreadLinkCandidates,
	type CodexThreadLinkClassifierOptions,
	type CodexThreadLinkOptions,
	type ThreadLinkEpochAuthority,
} from "../index.ts";

declare const session: CodexThreadLinkClassifierOptions["session"];
declare const epoch: ThreadLinkEpochAuthority;
declare const publicBinding: ReturnType<typeof createCodexThreadLinkBinding>;

function observationOnlyConstruction(): void {
	const downstreamOptions = { session, epoch } satisfies CodexThreadLinkOptions;
	createCodexThreadLink(downstreamOptions);
	void createCodexThreadLink(downstreamOptions).discoverCandidates();
	void discoverCodexThreadLinkCandidates(downstreamOptions);

	const observationOnlyOptions = {
		session,
		currentEpoch: () => null,
	} satisfies CodexThreadLinkClassifierOptions;
	const observationWithAuthorityOptions = {
		session,
		epoch,
	} satisfies CodexThreadLinkClassifierOptions;
	createCodexThreadLinkClassifier(observationOnlyOptions);
	createCodexThreadLinkClassifier(observationWithAuthorityOptions);
	// @ts-expect-error Candidate discovery requires durable epoch authority.
	void discoverCodexThreadLinkCandidates(observationOnlyOptions);
}

function rejectedConstruction(): void {
	// @ts-expect-error A bind-capable port must require its live epoch authority.
	createCodexThreadLink({ session });
	// @ts-expect-error A current-epoch callback cannot replace the durable authority for a port.
	createCodexThreadLink({ session, currentEpoch: () => null });
	const snapshotOnly: Pick<ThreadLinkEpochAuthority, "snapshot"> = epoch;
	const staticSnapshotOptions = { session, epoch: snapshotOnly };
	// @ts-expect-error A static snapshot is not a live epoch authority.
	createCodexThreadLink(staticSnapshotOptions);
	// @ts-expect-error The public port owns its binding; callers cannot inject a store.
	createCodexThreadLink({ session, epoch, binding: createCodexThreadLinkBinding() });
	// @ts-expect-error The standalone binding factory has no authority-taking option.
	createCodexThreadLinkBinding({ epoch });
	// @ts-expect-error Public bindings cannot adopt executable links through bind.
	publicBinding.bind("pane-a", null, undefined);
}

void observationOnlyConstruction;
void rejectedConstruction;

test("keeps the public binding factory parameterless at runtime", () => {
	const runtimeBinding = createCodexThreadLinkBinding();
	expect(typeof runtimeBinding.snapshot).toBe("function");
	expect("bind" in runtimeBinding).toBe(false);
});
