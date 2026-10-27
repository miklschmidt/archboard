import {
	useCallback,
	useEffect,
	useMemo,
	useState,
	type ComponentProps,
	type JSX,
	type ReactNode,
} from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@archboard/ui-kit/components";
import { tabSessionId } from "#ui/clients/pane-session/tab-session.ts";
import { ModelExplanationContext } from "#ui/state/architecture-model/explanations.ts";
import type { PaneReading } from "#ui/state/pane-session/pane-reading.ts";
import {
	explanationKey,
	explanationQuery,
	explanationRequest,
	type ExplanationInvocation,
	type ExplanationRequest,
} from "#ui/clients/architecture-model/explanations.ts";
import { ModelExplanationResult } from "#ui/components/architecture-model/ModelExplanationResult.tsx";

interface HostProps {
	vault: string;
	connected: boolean;
	focused: boolean;
	onReading: (reading: PaneReading | null) => void;
	children: ReactNode;
}

/**
 * Keep one tab answer visible while its underlying architecture changes.
 * @param props The existing pane connection and content.
 * @returns Action context and the cached temporary answer.
 */
function ModelExplanationHost(props: HostProps): JSX.Element {
	const tab = tabSessionId();
	const client = useQueryClient();
	const query = useQuery({ ...explanationQuery(props.vault, tab), enabled: props.connected });
	const refresh = useCallback(
		() => client.invalidateQueries({ queryKey: explanationKey(tab) }),
		[client, tab],
	);
	useEffect(() => {
		if (props.connected) void refresh();
	}, [props.connected, refresh]);
	const mutation = useMutation({
		/**
		 * Submit one explicit action without automatic retries.
		 * @param request The captured vault and action intent.
		 * @param request.vault The actual action vault.
		 * @param request.input The shared local action.
		 * @returns Its resulting snapshot, or a visible refusal.
		 */
		mutationFn: async ({ vault, input }: { vault: string; input: ExplanationRequest }) => {
			const result = await explanationRequest(vault, input);
			if (!result.success) throw new Error(result.error);
			return result.action;
		},
		retry: false,
		onSettled: refresh,
	});
	const { mutate, isPending } = mutation;
	const invoke = useCallback(
		(vault: string, input: ExplanationInvocation): void => {
			mutate({ vault, input: { type: "invoke", tabSessionId: tab, ...input } });
		},
		[mutate, tab],
	);
	const value = useMemo(
		() => ({ invoke, report: props.onReading, pending: isPending || !props.connected }),
		[invoke, props.onReading, isPending, props.connected],
	);
	const action = query.data?.success ? query.data.action : null;
	const control = useCallback(
		(type: "retry" | "cancel"): void => {
			if (action === null) return;
			mutate({
				vault: action.vault,
				input: { type, tabSessionId: tab, actionId: action.actionId },
			});
		},
		[action, mutate, tab],
	);
	return (
		<ModelExplanationContext value={value}>
			{props.children}
			{props.focused && (
				<ExplanationOutput
					action={action}
					pending={isPending}
					onControl={control}
					error={mutation.error ?? query.error}
					onRefresh={refresh}
				/>
			)}
		</ModelExplanationContext>
	);
}

export { ModelExplanationHost };

interface OutputProps extends Omit<
	ComponentProps<typeof ModelExplanationResult>,
	"action" | "onClose"
> {
	action: ComponentProps<typeof ModelExplanationResult>["action"] | null;
	error: Error | null;
	onRefresh: () => Promise<void>;
}

/**
 * Dismissal belongs to presentation and never deletes a captured answer.
 * @param props The cached action and its recovery controls.
 * @returns A temporary result with an explicit read or invocation failure.
 */
function ExplanationOutput(props: OutputProps): JSX.Element {
	const { action } = props;
	const [dismissed, dismiss] = useState<string | null>(null);
	const identity = action === null ? null : `${action.actionId}:${action.attempt}`;
	const close = useCallback(() => dismiss(identity), [identity]);
	return (
		<>
			{props.error !== null && (
				<p role="alert" className="text-body border-border border-t px-6 py-3">
					{props.error.message}{" "}
					<Button variant="ghost" size="sm" onClick={props.onRefresh}>
						Refresh answer
					</Button>
				</p>
			)}
			{action !== null && identity !== dismissed && (
				<ModelExplanationResult
					action={action}
					pending={props.pending}
					onControl={props.onControl}
					onClose={close}
				/>
			)}
		</>
	);
}
