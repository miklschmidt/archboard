// Archboard's names for the parts of the voice agent's extension contract that it implements.
// Every type is read from the one contract the voice package publishes, `VoiceAgentExtensions`,
// so a change of the contract reaches Archboard's code as a type error, not as a drifted copy.
import type {
	VoiceAgentBrowserPort,
	VoiceAgentExtensions,
} from "@archboard/codex-realtime-voice/server";
import type { createCodexWaitGraph } from "@archboard/codex-realtime-voice/runtime";

type Extensions = Required<VoiceAgentExtensions>;

/** How a host's execution context is encoded into the bytes a thread reads. */
export type WorkbenchContextCodec = Extensions["contextCodec"];
/** The captured execution facts and host payload one context encodes. */
export type WorkbenchExecutionContext = Parameters<WorkbenchContextCodec["encode"]>[0];
/** What the coordinator is told about the host page. */
export type WorkbenchContextSource = Extensions["context"];
/** How voice starts, for a narrative or an ordinary session. */
export type WorkbenchVoicePolicy = Extensions["voice"];
/** How the narrative a voice session presents is checked, prepared, opened and forgotten. */
export type VoiceNarrativeAdapter = Extensions["narrative"];
/** The host's domain tools: their manifest registrations and their installation. */
export type CodexWorkbenchDomainTools = Extensions["domainTools"];
/** The capabilities of one Codex generation that the core grants to domain tools. */
export type CodexWorkbenchDomainScope = Parameters<CodexWorkbenchDomainTools["install"]>[0];
/** The installed domain: its dispatch and its cleanup hooks. */
export type CodexWorkbenchDomain = ReturnType<CodexWorkbenchDomainTools["install"]>;
/** The authority an operation's context is captured under. */
export type WorkbenchOperationAuthority = Parameters<Extensions["contextForOperation"]>[0];
/** One operation whose context is captured before it runs. */
export type PendingOperation = Parameters<Extensions["contextForOperation"]>[1];
/** The core's registry of browser tabs and the conversation each shows. */
export type TabSessions = Parameters<Extensions["installBrowserSessions"]>[0];
/** The browser command-lease ledger shared with the host's own sockets. */
export type BrowserLeaseLedger = Extensions["browserLeaseLedger"];
/** One live tab session of a generation. */
export type CodexWorkbenchTabSession = ReturnType<CodexWorkbenchDomainScope["sessions"]["require"]>;
/** The durable epoch store of a generation. */
export type CodexEpochStore = CodexWorkbenchDomainScope["epoch"];
/** The thread-link port of a generation. */
export type CodexThreadLinkPort = CodexWorkbenchDomainScope["threadLink"];

/** One staged epoch or operation, committed, rolled back or marked unknown later. */
export type EpochTransaction = ReturnType<CodexEpochStore["stageEpoch"]>;
/** What staging an epoch or operation records. */
export type EpochStageInput = Parameters<CodexEpochStore["stageEpoch"]>[0];
/** The durable record of one epoch or operation. */
export type EpochOperationRecord = ReturnType<CodexEpochStore["startEpoch"]>;
/** The thread and turn evidence that confirms an operation's outcome. */
export type EpochConfirmation = NonNullable<Parameters<CodexEpochStore["commitEpoch"]>[1]>;
/** What asking whether an operation may still execute names. */
export type EpochExecutionRequest = Parameters<CodexEpochStore["assertCurrent"]>[0];
/** The proof that an operation belongs to the current epoch. */
export type EpochExecutionProof = ReturnType<CodexEpochStore["assertCurrent"]>;
/** The store's whole durable state. */
export type EpochSnapshot = ReturnType<CodexEpochStore["snapshot"]>;
/** The thread a link classification is asked about. */
export type ThreadLinkTarget = Parameters<CodexThreadLinkPort["classify"]>[0];
/** What the core concluded about a thread: executable, inspect-only or unbound, and why. */
export type ThreadLinkClassification = Awaited<ReturnType<CodexThreadLinkPort["classify"]>>;
/** The evidence a thread link's classification rests on. */
export type ThreadLinkEpochProof = EpochOperationRecord | EpochExecutionProof;
/** The wait graph that refuses a wait cycle between workhorse threads. */
export type CodexWaitGraph = ReturnType<typeof createCodexWaitGraph>;
/** The tool call that owns a set of wait edges. */
export type WaitOwner = Parameters<CodexWaitGraph["addEdgeSet"]>[0]["owner"];
/** Why an owner's wait edges were released. */
export type OwnedWaitCleanupCause = Extract<
	Parameters<CodexWaitGraph["release"]>[0],
	{ readonly owner: unknown }
>["cause"];
/** One tab session's coordinator, realtime voice and thread components. */
export type CodexWorkbenchSessionComponents = CodexWorkbenchTabSession["components"];
/** One workhorse of a tab session, the one that works in one checkout. */
export type CodexWorkbenchWorkhorse =
	CodexWorkbenchTabSession["workhorses"] extends ReadonlyMap<string, infer Workhorse>
		? Workhorse
		: never;
/** One workhorse's thread and queue components. */
export type CodexWorkbenchWorkhorseComponents = CodexWorkbenchWorkhorse["components"];
/** The browser actions a domain's dynamic approvals answer. */
export type BrowserDynamicApprovalActions = NonNullable<
	CodexWorkbenchDomain["approvals"]
>["browser"];
/** The lease-bound browser context an approval answer arrives with. */
export type BrowserActionContext = Parameters<BrowserDynamicApprovalActions["resolve"]>[1];
/** What answering a browser action resolves with. */
export type BrowserActionResult = Awaited<ReturnType<BrowserDynamicApprovalActions["resolve"]>>;
/** The exact physical socket a host registers with the browser port. */
export type BrowserConnectionInstance = Parameters<VoiceAgentBrowserPort["accept"]>[0];
