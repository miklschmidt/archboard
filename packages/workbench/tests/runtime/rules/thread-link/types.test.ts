import { expect, test } from "bun:test";

import { createCodexThreadLink } from "#runtime/rules/thread-link/thread-link.ts";
import { createCodexThreadLinkBinding } from "#runtime/rules/thread-link/binding.ts";
import { createCodexThreadLinkClassifier } from "#runtime/rules/thread-link/classifier.ts";
import type {
	CodexThreadLinkClassifierOptions,
	ThreadLinkEpochAuthority,
} from "#runtime/rules/thread-link/contract.ts";
import type { CodexThreadLinkOptions } from "#runtime/rules/thread-link/thread-link.ts";

declare const session: CodexThreadLinkClassifierOptions["session"];
declare const epoch: ThreadLinkEpochAuthority;
declare const publicBinding: ReturnType<typeof createCodexThreadLinkBinding>;

function observationOnlyConstruction(): void {
	const downstreamOptions = {
		session,
		epoch,
		threadSource: "archboard",
	} satisfies CodexThreadLinkOptions;
	createCodexThreadLink(downstreamOptions);

	const observationOnlyOptions = {
		threadSource: "archboard",
		session,
		currentEpoch: (): null => null,
	} satisfies CodexThreadLinkClassifierOptions;
	const observationWithAuthorityOptions = {
		threadSource: "archboard",
		session,
		epoch,
	} satisfies CodexThreadLinkClassifierOptions;
	createCodexThreadLinkClassifier(observationOnlyOptions);
	createCodexThreadLinkClassifier(observationWithAuthorityOptions);
}

function rejectedConstruction(): void {
	// @ts-expect-error A bind-capable port must require its live epoch authority.
	createCodexThreadLink({ threadSource: "archboard", session });
	// @ts-expect-error A current-epoch callback cannot replace the durable authority for a port.
	createCodexThreadLink({ threadSource: "archboard", session, currentEpoch: (): null => null });
	const snapshotOnly: Pick<ThreadLinkEpochAuthority, "snapshot"> = epoch;
	const staticSnapshotOptions = { session, epoch: snapshotOnly, threadSource: "archboard" };
	// @ts-expect-error A static snapshot is not a live epoch authority.
	createCodexThreadLink(staticSnapshotOptions);
	createCodexThreadLink({
		threadSource: "archboard",
		session,
		epoch,
		// @ts-expect-error The public port owns its binding; callers cannot inject a store.
		binding: createCodexThreadLinkBinding(),
	});
	// @ts-expect-error The standalone binding factory has no authority-taking option.
	createCodexThreadLinkBinding({ epoch });
	type PublicBindingHasNoBind = "bind" extends keyof typeof publicBinding ? never : true;
	const publicBindingHasNoBind: PublicBindingHasNoBind = true;
	void publicBindingHasNoBind;
}

void observationOnlyConstruction;
void rejectedConstruction;

test("keeps the public binding factory parameterless at runtime", () => {
	const runtimeBinding = createCodexThreadLinkBinding();
	expect(typeof runtimeBinding.snapshot).toBe("function");
	expect("bind" in runtimeBinding).toBe(false);
});
