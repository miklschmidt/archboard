// The session's details, on request: who is signed in, which models the
// agent and the voice coordinator run, how much of the context window the
// conversation has used, and the ids to quote when something needs looking
// into. The one place this plumbing lives; nothing here is needed to use the
// agent.

import type { JSX, ReactNode } from "react";

import type { BrowserSnapshot } from "@archboard/codex-realtime-voice/contract";

/** The usage Codex last reported for the conversation. */
type BrowserTimelineUsage = NonNullable<NonNullable<BrowserSnapshot["timeline"]>["usage"]>;
import { VoiceContextDetails } from "#ui/components/voice/VoiceContextDetails.tsx";
import { clockTime, shortId } from "#ui/rules/dock/format.ts";
import type { AgentView } from "#ui/state/surfaces/contracts.ts";

/** Inputs for the details. */
interface AgentDetailsProps {
	readonly view: AgentView;
}

/** The account's words. */
const ACCOUNT_WORDS: Readonly<Record<string, string>> = {
	chatgpt: "ChatGPT",
	apiKey: "OpenAI API key",
	amazonBedrock: "Amazon Bedrock",
};

/**
 * Who is signed in, in words.
 * @param snapshot The snapshot.
 * @returns The words.
 */
function accountWords(snapshot: BrowserSnapshot | null): string {
	const account = snapshot?.account;
	if (account?.state !== "ready") return "Not signed in";
	return `Signed in with ${ACCOUNT_WORDS[account.accountType] ?? account.accountType}`;
}

/**
 * Which pane holds the command lease, and until when.
 * @param snapshot The snapshot, or null.
 * @returns The words, or null while no lease was taken.
 */
function leaseWords(snapshot: BrowserSnapshot | null): string | null {
	const lease = snapshot?.lease ?? null;
	if (lease === null) return null;
	return `${lease.state} · pane ${lease.paneId} · until ${clockTime(lease.expiresAtMs)}`;
}

/**
 * How the last command settled.
 * @param snapshot The snapshot, or null.
 * @returns The words, or null before any command.
 */
function operationWords(snapshot: BrowserSnapshot | null): string | null {
	const operation = snapshot?.operation ?? null;
	if (operation === null) return null;
	const outcome = `${operation.outcome.replaceAll("_", " ")} · ${shortId(operation.operationId)}`;
	return operation.message === null ? outcome : `${outcome} · ${operation.message}`;
}

/**
 * The usage Codex last reported for the conversation.
 * @param snapshot The snapshot, or null.
 * @returns The usage, or null before Codex reports it.
 */
function usageOf(snapshot: BrowserSnapshot | null): BrowserTimelineUsage | null {
	return snapshot?.timeline?.usage ?? null;
}

/**
 * The share of the context window the conversation has used.
 * @param usage What Codex reported, or null.
 * @returns The words, or null before Codex reports usage.
 */
function contextWords(usage: BrowserTimelineUsage | null): string | null {
	if (usage === null) return null;
	const window = usage.modelContextWindow ?? 0;
	const total = `${usage.total.totalTokens.toLocaleString("en")} tokens in total`;
	const share = Math.min(100, Math.round((usage.last.totalTokens / Math.max(window, 1)) * 100));
	return window === 0 ? total : `${share}% of the context window · ${total}`;
}

/**
 * The model and effort one owner runs.
 * @param snapshot The snapshot.
 * @param owner Whose.
 * @returns The words, or null when not reported.
 */
function modelWords(
	snapshot: BrowserSnapshot | null,
	owner: "workhorse" | "coordinator",
): string | null {
	const settings = snapshot?.settings.find((entry) => entry.owner === owner);
	if (settings === undefined) return null;
	return settings.effort === null ? settings.model : `${settings.model} · ${settings.effort}`;
}

/**
 * The session's details.
 * @param props The view.
 * @returns The details.
 */
function AgentDetails(props: AgentDetailsProps): JSX.Element {
	const { snapshot } = props.view;
	const threadId = snapshot?.threadLink.threadId ?? null;
	return (
		<div data-slot="agent-details" className="flex flex-1 flex-col gap-5 overflow-y-auto px-5 py-4">
			<Section title="Account">
				<Row label="Account" value={accountWords(snapshot)} />
			</Section>
			<Section title="Conversation">
				<Row label="Model" value={modelWords(snapshot, "workhorse")} />
				<Row label="Context" value={contextWords(usageOf(snapshot))} />
				<Row label="Thread" value={threadId} technical />
				<Row label="Lease" value={leaseWords(snapshot)} technical />
				<Row label="Last command" value={operationWords(snapshot)} technical />
			</Section>
			<Section title="Voice">
				<Row label="Model" value={modelWords(snapshot, "coordinator")} />
				<p className="text-body text-muted-foreground">
					The voice coordinator works in a thread of its own. It decides which spoken requests
					become work for the agent, and which approvals it may answer from what it heard. Its turns
					show in the conversation under its name.
				</p>
				<VoiceContextDetails voiceContext={snapshot?.voiceContext} />
			</Section>
		</div>
	);
}

/**
 * One section, headed in sentence case.
 * @param props The title and the rows.
 * @param props.title The heading.
 * @param props.children The rows.
 * @returns The section.
 */
function Section(props: { readonly title: string; readonly children: ReactNode }): JSX.Element {
	return (
		<section className="flex flex-col gap-2">
			<h3 className="text-control font-semibold">{props.title}</h3>
			{props.children}
		</section>
	);
}

/**
 * One fact.
 * @param props The label, the value and whether it is technical.
 * @param props.label What it is.
 * @param props.value The value, or null when not reported.
 * @param props.technical Whether to set it in the technical face.
 * @returns The row, or nothing without a value.
 */
function Row(props: {
	readonly label: string;
	readonly value: string | null;
	readonly technical?: boolean;
}): JSX.Element | null {
	if (props.value === null) return null;
	return (
		<div className="flex items-baseline gap-3">
			<span className="text-body text-muted-foreground w-24 shrink-0">{props.label}</span>
			<span
				className={
					props.technical === true
						? "text-technical min-w-0 font-mono break-all"
						: "text-body min-w-0"
				}
			>
				{props.value}
			</span>
		</div>
	);
}

export { AgentDetails, type AgentDetailsProps };
