import { RiNotification3Line } from "@remixicon/react";
import { useCallback, useState, type JSX } from "react";
import type { UseQueryResult } from "@tanstack/react-query";

import type { VaultCheck } from "@archboard/board/policy";
import { Button, Dialog } from "@archboard/ui-kit/components";
import { DiagnosticList } from "#ui/components/vault-diagnostics/DiagnosticList.tsx";
import { useVaultCheck } from "#ui/hooks/vault-diagnostics/use-vault-check.ts";
import { useVaultRepair } from "#ui/hooks/vault-diagnostics/use-vault-repair.ts";
import type { BrowserWorkbenchTransport } from "@archboard/codex-realtime-voice/controllers";

interface VaultDiagnosticsProps {
	/** The focused pane's vault: the bell speaks for the repository in front of the person. */
	vault: string;
	/** The focused pane's transport, to check again when the agent's turn ends. */
	transport: BrowserWorkbenchTransport | null;
	/** Send the agent a message; the agent sets itself up if it needs to. */
	ask: (text: string) => void;
}

/**
 * Vault-wide warnings and errors with ordinary agent repair.
 * @param props The focused pane's vault and transport, and the way to ask the agent.
 * @returns The header bell and diagnostics dialog.
 */
function VaultDiagnostics(props: VaultDiagnosticsProps): JSX.Element {
	const { transport, ask } = props;
	const check = useVaultCheck(props.vault);
	const [open, setOpen] = useState(false);
	const { refetch } = check;
	const recheck = useCallback(() => {
		void refetch();
	}, [refetch]);
	const repair = useVaultRepair(props.vault, transport, ask, recheck);
	const count = check.data?.diagnostics.length ?? 0;
	const handleRepair = useCallback(() => {
		repair();
		setOpen(false);
	}, [repair]);
	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DiagnosticsBell count={count} failed={check.isError} />
			<Dialog.Content className="sm:max-w-2xl">
				<Dialog.Header>
					<Dialog.Title>Vault diagnostics</Dialog.Title>
					<Dialog.Description>
						{check.data?.configurationValid === false
							? "Configuration needs attention. Boards use bundled defaults until it is repaired."
							: "Configuration and every board family, checked together."}
					</Dialog.Description>
				</Dialog.Header>
				<CheckResult check={check} />
				<Dialog.Footer>
					<Button variant="outline" onClick={recheck} disabled={check.isFetching}>
						Check again
					</Button>
					<Button onClick={handleRepair} disabled={count === 0}>
						Fix with Codex
					</Button>
				</Dialog.Footer>
			</Dialog.Content>
		</Dialog>
	);
}

/**
 * Announce the issue count and show the warning dot.
 * @param props The latest check state.
 * @param props.count Number of issues.
 * @param props.failed Whether the check failed.
 * @returns The bell trigger.
 */
function DiagnosticsBell(props: { count: number; failed: boolean }): JSX.Element {
	const { count, failed } = props;
	return (
		<Dialog.Trigger
			className="hover:bg-accent focus-visible:ring-ring relative inline-flex size-8 items-center justify-center rounded-md outline-none focus-visible:ring-2"
			aria-label={count > 0 ? `Vault diagnostics: ${count} issues` : "Vault diagnostics"}
		>
			<RiNotification3Line className="size-4" />
			{(count > 0 || failed) && (
				<span className="absolute top-1 right-1 size-1.5 rounded-full bg-amber-500" />
			)}
		</Dialog.Trigger>
	);
}

/**
 * Preserve the last check alongside pending or failed refreshes.
 * @param props The query snapshot.
 * @param props.check The checker query.
 * @returns Its loading, failure and readable result.
 */
function CheckResult(props: { check: UseQueryResult<VaultCheck> }): JSX.Element {
	const { check } = props;
	return (
		<>
			{check.isError && <p role="alert">{check.error.message}</p>}
			{check.isFetching && <output>Checking the vault…</output>}
			{check.data !== undefined && <DiagnosticList diagnostics={check.data.diagnostics} />}
		</>
	);
}

export { VaultDiagnostics };
