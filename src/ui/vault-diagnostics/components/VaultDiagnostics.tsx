import { RiNotification3Line } from "@remixicon/react";
import { useCallback, useState, type JSX } from "react";
import type { UseQueryResult } from "@tanstack/react-query";

import type { VaultCheck } from "@/shared/semantic-policy";
import { Button } from "@/ui/components/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/ui/components/dialog";
import { DiagnosticList } from "@/ui/vault-diagnostics/components/DiagnosticList";
import { useVaultCheck } from "@/ui/vault-diagnostics/hooks/use-vault-check";
import { useVaultRepair } from "@/ui/vault-diagnostics/hooks/use-vault-repair";
import type { VaultRepairTarget } from "@/ui/vault-diagnostics/api";

interface VaultDiagnosticsProps {
	target: VaultRepairTarget | null;
	chooseThread: () => void;
}

/**
 * Vault-wide warnings and errors with ordinary agent repair.
 * @param props The active workhorse and chooser.
 * @returns The header bell and diagnostics dialog.
 */
function VaultDiagnostics(props: VaultDiagnosticsProps): JSX.Element {
	const { target, chooseThread } = props;
	const check = useVaultCheck();
	const [open, setOpen] = useState(false);
	const { refetch } = check;
	const recheck = useCallback(() => {
		void refetch();
	}, [refetch]);
	const choose = useCallback(() => {
		setOpen(false);
		chooseThread();
	}, [chooseThread]);
	const { repair, pending, message } = useVaultRepair(target, recheck, choose);
	const count = check.data?.diagnostics.length ?? 0;
	const handleRepair = useCallback(() => {
		void repair();
	}, [repair]);
	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DiagnosticsBell count={count} failed={check.isError} />
			<DialogContent className="sm:max-w-2xl">
				<DialogHeader>
					<DialogTitle>Vault diagnostics</DialogTitle>
					<DialogDescription>
						{check.data?.configurationValid === false
							? "Configuration needs attention. Boards use bundled defaults until it is repaired."
							: "Configuration and every board family, checked together."}
					</DialogDescription>
				</DialogHeader>
				<CheckResult check={check} />
				<output className="text-muted-foreground">{message}</output>
				<DialogFooter>
					<Button variant="outline" onClick={recheck} disabled={check.isFetching}>
						Check again
					</Button>
					<Button onClick={handleRepair} disabled={pending || count === 0}>
						Fix with Codex
					</Button>
				</DialogFooter>
			</DialogContent>
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
		<DialogTrigger
			className="hover:bg-accent focus-visible:ring-ring relative inline-flex size-8 items-center justify-center rounded-md outline-none focus-visible:ring-2"
			aria-label={count > 0 ? `Vault diagnostics: ${count} issues` : "Vault diagnostics"}
		>
			<RiNotification3Line className="size-4" />
			{(count > 0 || failed) && (
				<span className="absolute top-1 right-1 size-1.5 rounded-full bg-amber-500" />
			)}
		</DialogTrigger>
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
