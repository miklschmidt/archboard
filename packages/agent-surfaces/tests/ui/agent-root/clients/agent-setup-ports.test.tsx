// What the agent's setup speaks through, across the agent's root: voice is kept on the pane it
// started in, and let go once it ends; a start that does not reach a live voice says why and
// keeps voice following focus; a narration that needs a sign-in opens its tab from the person's
// gesture; and a thread-link step reports its own settlement.
//
// The page holds the agent over two panes, each handing it a conversation over fakes, and reads
// the voice through the hook the shell reads it through.

import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { afterAll, afterEach, expect, test } from "bun:test";
import { useEffect, type JSX } from "react";

GlobalRegistrator.register();
Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", { value: true, writable: true });
const { act, cleanup, render } = await import("@testing-library/react");
const { AgentRoot } = await import("#ui/agent-root/components/AgentRoot.tsx");
const { AgentPane } = await import("#ui/agent-root/components/AgentPane.tsx");
const { useAgentVoice } = await import("#ui/agent-root/hooks/use-agent.ts");
const { threadLinkStep } = await import("#ui/agent-root/clients/agent-setup-ports.ts");
const { fakeConversation } = await import("#tests/ui/support/agent-root/conversation.tsx");
const { mediaSnapshot } = await import("#tests/ui/support/voice-session/fakes.ts");
const { snapshot, voice } = await import("#tests/ui/support/voice-session/workbench-fixture.ts");
const { STAGES } = await import("#tests/ui/support/agent-setup/support.ts");

type AgentVoice = ReturnType<typeof useAgentVoice>;
type FakeConversation = ReturnType<typeof fakeConversation>;

afterEach(() => {
	cleanup();
});
afterAll(async () => {
	await Bun.sleep(1);
	await GlobalRegistrator.unregister();
});

/** Nobody opens a file here. */
function openNoFile(): void {
	// No answer names a file.
}

/**
 * Showing a conversation, which these tests never wait on.
 * @returns That it was shown.
 */
function shown(): Promise<boolean> {
	return Promise.resolve(true);
}

/** Closing the stand-in tab does nothing. */
function closeNothing(): void {
	// The stand-in tab has nothing to close.
}

/** The panes of the page. */
const PANES = ["pane-a", "pane-b"] as const;

/** A page with the agent over two panes, and the voice as the shell reads it. */
interface Page {
	/**
	 * The voice as the shell reads it now.
	 * @returns The voice.
	 */
	readonly voice: () => AgentVoice;
	/**
	 * Focus a pane.
	 * @param paneId The pane.
	 */
	readonly focus: (paneId: string) => void;
}

/**
 * Draw the page with one pane focused.
 * @param conversations Each pane's conversation.
 * @param active The focused pane.
 * @returns The page.
 */
function page(conversations: Readonly<Record<string, FakeConversation>>, active = "pane-a"): Page {
	const seen: { voice: AgentVoice | null } = { voice: null };
	/**
	 * Read the voice where the shell reads it, and hand it to the test once drawn.
	 * @returns Nothing drawn.
	 */
	function Shell(): null {
		const read = useAgentVoice();
		useEffect(() => {
			seen.voice = read;
		});
		return null;
	}
	/**
	 * The page with a pane focused.
	 * @param props The focused pane.
	 * @param props.focused It.
	 * @returns The page.
	 */
	function Page(props: { readonly focused: string }): JSX.Element {
		return (
			<AgentRoot
				activePaneId={props.focused}
				openAnswerFile={openNoFile}
				chooseShownConversation={shown}
			>
				{PANES.map((paneId) => (
					<AgentPane
						key={paneId}
						paneId={paneId}
						conversation={conversations[paneId]?.conversation ?? null}
						recording={false}
						dockless={false}
						reducedMotion={false}
					>
						{(laid) => <div data-pane={paneId}>{laid}</div>}
					</AgentPane>
				))}
				<Shell />
			</AgentRoot>
		);
	}
	const { rerender } = render(<Page focused={active} />);
	return {
		/**
		 * The voice now.
		 * @returns It.
		 */
		voice: () => {
			if (seen.voice === null) throw new Error("The shell has not read the voice.");
			return seen.voice;
		},
		/**
		 * Focus a pane.
		 * @param paneId The pane.
		 */
		focus: (paneId) => {
			rerender(<Page focused={paneId} />);
		},
	};
}

/** Let the agent's steps and React's effects settle. */
async function settle(): Promise<void> {
	await act(async () => {
		await Bun.sleep(0);
	});
}

/**
 * The pane the voice is laid over.
 * @returns Its id, or null while no voice is laid.
 */
function voicePane(): string | null {
	return (
		document
			.querySelector('[data-slot="voice-box"]')
			?.closest("[data-pane]")
			?.getAttribute("data-pane") ?? null
	);
}

test("voice stays on the pane it started in while focus moves, and follows focus again once it ends", async () => {
	const a = fakeConversation();
	const b = fakeConversation();
	const agent = page({ "pane-a": a, "pane-b": b });
	await settle();
	act(() => {
		agent.voice().talk("pane-a", "tour");
	});
	await settle();
	expect(a.media.calls()).toEqual(["start"]);
	expect(agent.voice().standing()).toEqual({ kind: "live" });
	expect(voicePane()).toBe("pane-a");

	agent.focus("pane-b");
	await settle();
	expect(voicePane()).toBe("pane-a");

	act(() => {
		a.media.set(mediaSnapshot({ phase: "closed", reason: "stopped" }));
	});
	await settle();
	act(() => {
		agent.voice().talk("pane-b", "tour");
	});
	await settle();
	expect(b.media.calls()).toEqual(["start"]);
	expect(voicePane()).toBe("pane-b");
});

test("a start that does not reach a live voice says why, and voice keeps following focus", async () => {
	const off = fakeConversation(
		snapshot({ voice: voice({ state: "unavailable", reason: "Voice is off for this pane." }) }),
	);
	const b = fakeConversation();
	const agent = page({ "pane-a": off, "pane-b": b });
	await settle();
	act(() => {
		agent.voice().talk("pane-a");
	});
	await settle();
	const standing = agent.voice().standing();
	expect(standing.kind).toBe("failed");
	expect(standing.kind === "failed" ? standing.reason : "").toBe("Voice is off for this pane.");

	agent.focus("pane-b");
	await settle();
	act(() => {
		agent.voice().talk("pane-b");
	});
	await settle();
	expect(b.media.calls()).toEqual(["start"]);
});

test("narrating while signed out opens the tab for the provider's page from the gesture", async () => {
	let opens = 0;
	const opened = {
		opener: {},
		location: { href: "about:blank" },
		close: closeNothing,
	};
	const open = window.open;
	Object.defineProperty(window, "open", {
		configurable: true,
		/**
		 * Open a tab from the gesture.
		 * @returns The tab.
		 */
		value: () => {
			opens += 1;
			return opened;
		},
	});
	try {
		const signedOut = fakeConversation(STAGES.signedOut);
		const agent = page({ "pane-a": signedOut });
		await settle();
		act(() => {
			agent.voice().talk("pane-a", "tour");
		});
		expect(opens).toBe(1);
		expect(signedOut.media.calls()).toEqual([]);
	} finally {
		Object.defineProperty(window, "open", { configurable: true, value: open });
	}
});

test("a thread-link step reports its own settlement, never another action's", () => {
	type Snapshot = ReturnType<Parameters<typeof threadLinkStep>[0]["snapshot"]>;
	const succeeded: Snapshot = {
		state: "succeeded",
		revision: 2,
		action: "create",
		target: {
			chatId: "pane-a",
			childId: null,
			epoch: null,
			commandId: null,
			capturedLinkState: null,
			capturedLinkThreadId: null,
		},
		announcement: "Created.",
	};
	const failed: Snapshot = {
		...succeeded,
		state: "failed",
		announcement: "Codex refused the thread.",
	};
	/**
	 * A controller showing one snapshot.
	 * @param shownSnapshot The snapshot.
	 * @returns The controller.
	 */
	const showing = (shownSnapshot: Snapshot): { snapshot: () => Snapshot } => ({
		/**
		 * The snapshot.
		 * @returns It.
		 */
		snapshot: () => shownSnapshot,
	});
	expect(threadLinkStep(showing(succeeded), { state: "ignored", revision: 1 }).ok).toBe(false);
	expect(threadLinkStep(showing(succeeded), { state: "applied", revision: 1 }).ok).toBe(false);
	expect(threadLinkStep(showing(succeeded), { state: "applied", revision: 2 })).toEqual({
		ok: true,
	});
	expect(threadLinkStep(showing(failed), { state: "applied", revision: 2 })).toEqual({
		ok: false,
		reason: failed.announcement,
	});
});
