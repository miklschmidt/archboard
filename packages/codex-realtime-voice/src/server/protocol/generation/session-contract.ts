// What the tab sessions of one Codex child generation are, and what building one is handed
// (TASK-373, ADR 0050). The store that keeps them is `services/sessions/sessions.ts`.

import type { CoordinatorCallbacks } from "#runtime/protocol/coordinator-callbacks/contract.ts";
import type { CoordinatorToolDispatcher } from "#runtime/protocol/coordinator-tools/contract.ts";
import type { CodexCoordinator } from "#runtime/protocol/coordinator/contract.ts";
import type { CodexSpokenApprovalGate } from "#runtime/protocol/spoken-approval/contract.ts";
import type { CodexRealtimeAdapter } from "#runtime/services/realtime/contract.ts";
import type { CodexSession } from "@archboard/codex-app-server/session";
import type { ThreadUnload } from "#runtime/operations/thread-unload/unload.ts";
import type {
	CodexTransport,
	TransportServerNotification,
	DynamicServerRequest,
} from "@archboard/codex-app-server/transport";
import type { WorkhorseOperationEventListener } from "#runtime/protocol/workhorse-operations/contract.ts";
import type {
	ChildEpoch,
	ChildId,
	IdentityAuthority,
	LogicalToolCallCorrelation,
	ThreadId,
	TurnId,
} from "@archboard/codex-app-server/identity";
import type { BrowserRealtimeActions } from "#server/protocol/gateway/contract.ts";
import type { TabSessionId } from "#server/rules/tab-session/tab-session.ts";
import type { TabSessionEnding } from "#server/services/sessions/end.ts";
import type { CoordinatorTurnHome } from "#server/services/sessions/delegations.ts";
import type {
	CodexWorkbenchWorkhorse,
	CodexWorkbenchWorkhorseActions,
	CodexWorkbenchWorkhorseComponents,
	CodexWorkbenchWorkhorseState,
	WorkhorseStop,
} from "#server/services/sessions/workhorses.ts";
import type { SessionVoiceStartTrace } from "#server/services/voice/start-trace.ts";

/** The runtime owners a tab session's coordinator and voice run on. */
interface CodexWorkbenchSessionComponents {
	readonly realtime: CodexRealtimeAdapter;
	readonly coordinator: CodexCoordinator;
	readonly spokenApproval: CodexSpokenApprovalGate;
	readonly coordinatorTools: CoordinatorToolDispatcher;
	readonly callbacks: CoordinatorCallbacks;
}

/** What a browser asks of one tab session's voice. */
interface CodexWorkbenchTabSessionActions {
	readonly realtime: BrowserRealtimeActions;
}

/** What the server remembers about one tab session between the reads that fill it in. */
interface CodexWorkbenchTabSessionState {
	/** Which coordinator turn delegated each workhorse turn, newest last; bounded. */
	readonly delegations: Map<TurnId, TurnId>;
	/** Which conversation each coordinator turn shows in, newest last; bounded (ADR 0050). */
	readonly coordinatorTurnHomes: Map<TurnId, CoordinatorTurnHome>;
	/** The coordinator tool call running now, which every owner that asks sees the same. */
	currentCoordinatorCall: LogicalToolCallCorrelation | null;
	/** Every thread this tab started, its coordinator's and its workhorses', current and replaced. */
	readonly threads: Set<ThreadId>;
	/** The attempt this tab's latest voice start began, which its voice notes into. */
	readonly voiceTrace: SessionVoiceStartTrace;
	/**
	 * The checkout the tab showed when voice last started. Voice speaks for the whole tab, and its
	 * session is bound to that checkout's workhorse for as long as it runs; null before any start.
	 */
	voiceCheckout: string | null;
	/** Live while its tab may still use it; ending once the tab has gone, until its threads unload. */
	phase: "live" | "ending";
}

/** One browser tab's conversation: its coordinator and voice, and a workhorse per checkout. */
interface CodexWorkbenchTabSession {
	readonly id: TabSessionId;
	readonly components: CodexWorkbenchSessionComponents;
	readonly actions: CodexWorkbenchTabSessionActions;
	readonly state: CodexWorkbenchTabSessionState;
	/** Its workhorses, by checkout, in the order they were built. */
	readonly workhorses: ReadonlyMap<string, CodexWorkbenchWorkhorse>;
	/** The workhorse of one checkout, built the first time it is asked for while the tab is live. */
	readonly workhorse: (checkout: string) => CodexWorkbenchWorkhorse;
	/** The workhorse voice is bound to: the one of the checkout voice last started from. */
	readonly voiceWorkhorse: () => CodexWorkbenchWorkhorse | null;
	/**
	 * Stop the workhorse of one checkout, or every workhorse of the tab when the checkout is null.
	 * Each one that runs a turn has it interrupted; the others have nothing to stop.
	 */
	readonly stopWork: (checkout: string | null) => Promise<readonly WorkhorseStop[]>;
}

/** What building one tab session's coordinator and voice is handed. */
interface CodexWorkbenchTabSessionScope {
	readonly id: TabSessionId;
	readonly state: CodexWorkbenchTabSessionState;
	/** Record that this tab's coordinator started a thread, so what Codex says about it finds it. */
	readonly claimThread: (threadId: ThreadId) => void;
	/** Stop owning a thread something else already unloaded, such as a replaced coordinator's. */
	readonly releaseThread: (threadId: ThreadId) => void;
	/** The tab's workhorses, as they are when asked. */
	readonly workhorses: () => readonly CodexWorkbenchWorkhorse[];
	/** The workhorse of one checkout, built on first use. */
	readonly workhorse: (checkout: string) => CodexWorkbenchWorkhorse;
	/** The workhorse voice is bound to, or null. */
	readonly voiceWorkhorse: () => CodexWorkbenchWorkhorse | null;
	/** Stop the workhorse of one checkout, or every workhorse of the tab when the checkout is null. */
	readonly stopWork: CodexWorkbenchTabSession["stopWork"];
	/** Hear what every workhorse of the tab reports about its operations, built later or not. */
	readonly workhorseOperations: {
		readonly subscribe: (listener: WorkhorseOperationEventListener) => () => void;
	};
}

/** What building one workhorse is handed. */
interface CodexWorkbenchWorkhorseScope {
	readonly session: CodexWorkbenchTabSession;
	readonly checkout: string;
	readonly key: string;
	readonly state: CodexWorkbenchWorkhorseState;
	/** Record that this workhorse started a thread, so what Codex says about it finds it. */
	readonly claimThread: (threadId: ThreadId) => void;
	/** Record that the tab's coordinator started a thread, as a new conversation can make it. */
	readonly claimCoordinatorThread: (threadId: ThreadId) => void;
	/**
	 * Give up a thread this workhorse no longer runs on: it is unsubscribed once nothing runs on
	 * it, so Codex unloads it, and only then stops being this tab's.
	 */
	readonly retireThread: (threadId: ThreadId) => Promise<ThreadUnload>;
}

/** A tab session's own owners and actions, as its builder made them. */
interface BuiltTabSession {
	readonly components: CodexWorkbenchSessionComponents;
	readonly actions: CodexWorkbenchTabSessionActions;
}

/** A workhorse's owners and actions, as its builder made them. */
interface BuiltWorkhorse {
	readonly components: CodexWorkbenchWorkhorseComponents;
	readonly actions: CodexWorkbenchWorkhorseActions;
}

interface CreateCodexWorkbenchSessionsOptions {
	/** Names threads as Codex spells them, and says which child and epoch are current. */
	readonly identity: Pick<IdentityAuthority, "decoder" | "validator">;
	/** Where a refused request is answered. */
	readonly transport: Pick<CodexTransport, "respond">;
	/** What reads a thread's status, unsubscribes it once it is idle, and interrupts its turn. */
	readonly session: Pick<CodexSession, "threadRead" | "threadUnsubscribe" | "turnInterrupt">;
	/** Where a session's links are cleared when the session ends. */
	readonly threadLink: TabSessionEnding["threadLink"];
	/** Settle every approval an ended session was still to answer. */
	readonly endApprovals: TabSessionEnding["endApprovals"];
	/** The checkout whose conversation a tab shows now, or null before any pane of it was read. */
	readonly shownConversationOf: (id: TabSessionId) => string | null;
	readonly resolveCheckout: (named: string) => string | null;
	/** Build one session's coordinator and voice. */
	readonly build: (scope: CodexWorkbenchTabSessionScope) => BuiltTabSession;
	/** Build one workhorse of a session. */
	readonly buildWorkhorse: (scope: CodexWorkbenchWorkhorseScope) => BuiltWorkhorse;
}

interface CodexWorkbenchSessions {
	/** The live session with this id, built the first time it is asked for or after it ended. */
	readonly open: (id: TabSessionId) => CodexWorkbenchTabSession;
	/** The live session with this id, refused when there is none. */
	readonly require: (id: TabSessionId) => CodexWorkbenchTabSession;
	/** Every live session, in the order they opened. */
	readonly list: () => readonly CodexWorkbenchTabSession[];
	/** The live session that started this thread, or null when none did or it is ending. */
	readonly forThread: (threadId: ThreadId) => CodexWorkbenchTabSession | null;
	/** The workhorse of a live session that started this thread, or null when none did. */
	readonly workhorseForThread: (threadId: ThreadId) => CodexWorkbenchWorkhorse | null;
	/** Hand one notification to the session its thread belongs to, or to every session. */
	readonly onNotification: (event: TransportServerNotification) => void;
	/** Hand a coordinator tool call to the calling thread's session, or refuse it. */
	readonly routeCoordinatorTool: (request: DynamicServerRequest) => void;
	/** Hand a workhorse's tell_coordinator call to the calling thread's session, or refuse it. */
	readonly routeCallback: (request: DynamicServerRequest) => void;
	/**
	 * End the live session with this id, because its tab has gone for good. Resolves once every
	 * thread it started was unloaded and the session was dropped; a session that is not live is
	 * left alone.
	 */
	readonly end: (id: TabSessionId) => Promise<void>;
	/** Settle what every session carried for a child that exited. */
	readonly childExit: (child: ChildId, epoch: ChildEpoch) => Promise<void>;
	/** Stop what every session runs: voice and the queues. */
	readonly stop: () => Promise<void>;
	/** Dispose every session's remaining owners and forget every session. */
	readonly dispose: () => Promise<void>;
	/** Hear when a session opens or ends, or gains a workhorse. */
	readonly onChange: (listener: () => void) => () => void;
}

export type {
	BuiltTabSession,
	BuiltWorkhorse,
	CodexWorkbenchSessionComponents,
	CodexWorkbenchSessions,
	CodexWorkbenchTabSession,
	CodexWorkbenchTabSessionActions,
	CodexWorkbenchTabSessionScope,
	CodexWorkbenchTabSessionState,
	CodexWorkbenchWorkhorseScope,
	CreateCodexWorkbenchSessionsOptions,
};
