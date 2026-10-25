// Archboard's names for the parts of the voice agent's extension contract that it implements.
// Every type is read from the one contract the voice package publishes, `VoiceAgentExtensions`,
// so a change of the contract reaches Archboard's code as a type error, not as a drifted copy.
import type { VoiceAgentExtensions } from "@archboard/codex-realtime-voice/server";

type Extensions = Required<VoiceAgentExtensions>;

/** How a host's execution context is encoded into the bytes a thread reads. */
export type WorkbenchContextCodec = Extensions["contextCodec"];
/** The captured execution facts and host payload one context encodes. */
export type WorkbenchExecutionContext = Parameters<WorkbenchContextCodec["encode"]>[0];
/** What the coordinator is told about the host page. */
export type WorkbenchContextSource = Extensions["context"];
/** How voice is presented and recorded. */
export type WorkbenchVoicePolicy = Extensions["voice"];
/** How a voice presentation is announced to the host page. */
export type WorkbenchVoicePresentationAdapter = Extensions["presentation"];
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
