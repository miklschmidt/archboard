import type { JSX } from "react";
import type { VaultDiagnostic } from "@/shared/semantic-policy";

/**
 * The last check stays visible while the next check is pending or failed.
 * @param props The checker's diagnostics.
 * @param props.diagnostics The issues.
 * @returns The issues, or the confirmed healthy state.
 */
function DiagnosticList(props: { diagnostics: VaultDiagnostic[] }): JSX.Element {
	const { diagnostics } = props;
	if (diagnostics.length === 0) return <p>No vault issues found.</p>;
	return (
		<ul className="divide-border max-h-[50vh] divide-y overflow-y-auto">
			{diagnostics.map((diagnostic) => (
				<Diagnostic key={JSON.stringify(diagnostic)} diagnostic={diagnostic} />
			))}
		</ul>
	);
}

/**
 * One actionable location from the shared checker.
 * @param props The issue.
 * @param props.diagnostic The actionable diagnostic.
 * @returns Its severity, explanation and location.
 */
function Diagnostic(props: { diagnostic: VaultDiagnostic }): JSX.Element {
	const { diagnostic } = props;
	return (
		<li className="space-y-1 py-3">
			<p className="font-medium">
				{diagnostic.severity === "error" ? "Error" : "Warning"}: {diagnostic.message}
			</p>
			<p className="text-muted-foreground font-mono text-xs break-all">
				{diagnostic.file}
				{diagnostic.path === undefined ? "" : ` · ${diagnostic.path}`}
			</p>
			{diagnostic.board !== undefined && (
				<p className="text-muted-foreground text-xs">
					{diagnostic.board}
					{diagnostic.variant === undefined ? "" : ` @ ${diagnostic.variant}`}
				</p>
			)}
		</li>
	);
}

export { DiagnosticList };
