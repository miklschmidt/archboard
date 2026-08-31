import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
	OpenerSelectionSchema,
	isAbsoluteOrBareOpenerExecutable,
	type CodeTargetNotice,
	type CodeTargetOpenFailure,
	type OpenerCommand,
	type OpenerSelection,
	type OpenerSettingsReply,
} from "../../../shared/code-target";
import {
	fetchOpenerSettings,
	resetOpenerSettings,
	saveOpenerSettings,
	testOpenerSettings,
} from "../../canvas/api";
import { Button } from "@/ui/button";
import {
	Dialog,
	DialogClose,
	DialogContent,
	DialogDescription,
	DialogTitle,
	type DialogProps,
} from "@/ui/dialog";
import { cn } from "@/ui/ui-classnames";

type Choice = "platform" | "vscode" | "cursor" | "zed" | "custom";
type ArgumentDraft = { id: string; value: string };
type CustomDraft = { executable: string; argv: ArgumentDraft[] };
type Working = "load" | "test" | "save" | "reset" | null;

const PRESETS = ["vscode", "cursor", "zed"] as const;
const LABELS: Record<Choice, string> = {
	platform: "System default",
	vscode: "VS Code",
	cursor: "Cursor",
	zed: "Zed",
	custom: "Custom",
};
const INPUT_CLASSES =
	"min-h-touch-target w-full rounded-control border border-border bg-surface-raised px-control-inline font-sans !text-control text-foreground outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

function choiceFor(selection: OpenerSelection): Choice {
	return selection.kind === "preset" ? selection.preset : selection.kind;
}

function commandText(command: OpenerCommand | null): string {
	return command ? [command.executable, ...command.argv].join(" ") : "Unavailable";
}

function toNotice(failure: CodeTargetOpenFailure): CodeTargetNotice {
	return { kind: "error", message: failure.error, actions: failure.actions ?? [] };
}

export interface OpenerSettingsDialogProps {
	onCancel: () => void;
	onSuccess: (message: string) => void;
	onFailure: (notice: CodeTargetNotice) => void;
}

export function OpenerSettingsDialog({
	onCancel,
	onSuccess,
	onFailure,
}: OpenerSettingsDialogProps): React.JSX.Element {
	const [settings, setSettings] = useState<OpenerSettingsReply | null>(null);
	const [choice, setChoice] = useState<Choice>("platform");
	const [custom, setCustom] = useState<CustomDraft>({
		executable: "",
		argv: [{ id: crypto.randomUUID(), value: "{path}" }],
	});
	const [repository, setRepository] = useState("");
	const [working, setWorking] = useState<Working>("load");
	const [serverError, setServerError] = useState<string | null>(null);
	const cancelRef = useRef<HTMLButtonElement>(null);

	const applySettings = useCallback(
		(result: OpenerSettingsReply | CodeTargetOpenFailure): void => {
			if (!result.success) {
				const next = toNotice(result);
				setServerError(next.message);
				setSettings(null);
				onFailure(next);
				setWorking(null);
				return;
			}
			setSettings(result);
			setChoice(choiceFor(result.selection));
			if (result.selection.kind === "custom") {
				setCustom({
					executable: result.selection.executable,
					argv: result.selection.argv.map((value) => ({ id: crypto.randomUUID(), value })),
				});
			}
			const usable = result.repositories.find((entry) => entry.exists && entry.identityMatches);
			setRepository(
				(current) => current || usable?.repository || result.repositories[0]?.repository || "",
			);
			setServerError(null);
			setWorking(null);
		},
		[onFailure],
	);
	const load = useCallback(async (): Promise<void> => {
		applySettings(await fetchOpenerSettings());
	}, [applySettings]);

	useEffect(() => {
		let live = true;
		void fetchOpenerSettings().then((result) => {
			if (live) applySettings(result);
			return result;
		});
		return () => {
			live = false;
		};
	}, [applySettings]);

	const draft: unknown = useMemo(() => {
		if (choice === "platform") return { version: 1, kind: "platform" };
		if (choice === "custom") {
			return {
				version: 1,
				kind: "custom",
				executable: custom.executable,
				argv: custom.argv.map((argument) => argument.value),
			};
		}
		return { version: 1, kind: "preset", preset: choice };
	}, [choice, custom]);
	const parsed = useMemo(() => OpenerSelectionSchema.safeParse(draft), [draft]);
	const validation = !parsed.success
		? (parsed.error.issues[0]?.message ?? "The opener selection is invalid.")
		: parsed.data.kind === "custom" && !isAbsoluteOrBareOpenerExecutable(parsed.data.executable)
			? "A custom executable must be absolute or a bare PATH name."
			: null;
	const selectedCheckout = settings?.repositories.find((entry) => entry.repository === repository);
	const testable = Boolean(selectedCheckout?.exists && selectedCheckout.identityMatches);
	const valid = parsed.success && validation === null;

	const choose = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
		setChoice(event.target.value as Choice);
		setServerError(null);
	}, []);
	const updateExecutable = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
		setCustom((current) => ({ ...current, executable: event.target.value }));
	}, []);
	const updateArgument = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
		const id = event.currentTarget.dataset.argumentId;
		const value = event.currentTarget.value;
		setCustom((current) => ({
			...current,
			argv: current.argv.map((argument) =>
				argument.id === id ? { ...argument, value } : argument,
			),
		}));
	}, []);
	const addArgument = useCallback(() => {
		setCustom((current) => ({
			...current,
			argv: [...current.argv, { id: crypto.randomUUID(), value: "" }],
		}));
	}, []);
	const removeArgument = useCallback((event: React.MouseEvent<HTMLButtonElement>) => {
		const id = event.currentTarget.dataset.argumentId;
		setCustom((current) => ({
			...current,
			argv: current.argv.filter((argument) => argument.id !== id),
		}));
	}, []);
	const chooseRepository = useCallback((event: React.ChangeEvent<HTMLSelectElement>) => {
		setRepository(event.target.value);
	}, []);

	const fail = useCallback(
		(failure: CodeTargetOpenFailure): void => {
			const next = toNotice(failure);
			setServerError(next.message);
			onFailure(next);
		},
		[onFailure],
	);
	const testDraft = useCallback(async (): Promise<void> => {
		if (!parsed.success || validation || !repository || !testable) return;
		setWorking("test");
		setServerError(null);
		const result = await testOpenerSettings(parsed.data, repository);
		setWorking(null);
		if (!result.success) return fail(result);
		onSuccess(`Test opener launched for ${result.repository}.`);
	}, [fail, onSuccess, parsed, repository, testable, validation]);
	const saveDraft = useCallback(async (): Promise<void> => {
		if (!parsed.success || validation) return;
		setWorking("save");
		setServerError(null);
		const result = await saveOpenerSettings(parsed.data);
		setWorking(null);
		if (!result.success) return fail(result);
		onSuccess("Saved. Every pane and caller uses this opener on the next activation.");
		onCancel();
	}, [fail, onCancel, onSuccess, parsed, validation]);
	const reset = useCallback(async (): Promise<void> => {
		setWorking("reset");
		setServerError(null);
		const result = await resetOpenerSettings();
		if (!result.success) {
			setWorking(null);
			fail(result);
			return;
		}
		onSuccess("Reset to the system default for every pane and caller.");
		await load();
	}, [fail, load, onSuccess]);
	const requestOpenChange = useCallback<DialogProps["onOpenChange"]>(
		(open) => {
			if (!open) onCancel();
		},
		[onCancel],
	);

	const busy = working !== null;
	const currentLabel = settings ? LABELS[choiceFor(settings.selection)] : "Could not read";
	const availability = settings?.availability;
	return (
		<Dialog open={true} onOpenChange={requestOpenChange}>
			<DialogContent className="opener-dialog gap-0 p-0 overflow-hidden" initialFocus={cancelRef}>
				<header className="flex items-start justify-between gap-region border-b border-border px-panel py-region">
					<div>
						<span className="mb-grid-tight block font-sans !text-technical font-semibold text-muted-foreground">
							archboard
						</span>
						<DialogTitle>Opener settings</DialogTitle>
					</div>
					<DialogClose
						aria-label="Close dialog"
						className="p-0 size-touch-target min-h-touch-target text-muted-foreground"
					>
						<span aria-hidden="true">×</span>
					</DialogClose>
				</header>

				<div className="overflow-auto px-panel py-region">
					{working === "load" && !settings && (
						<DialogDescription>Reading opener settings…</DialogDescription>
					)}
					{serverError && (
						<p className="opener-error mb-control rounded-control border border-destructive bg-destructive-subtle px-control-inline py-control !text-body text-destructive">
							{serverError}
						</p>
					)}

					<div
						className="opener-summary relative grid grid-cols-2 gap-control rounded-panel border border-border bg-surface-subtle p-control-inline"
						aria-label="Current opener"
					>
						<div className="min-w-0 grid gap-grid-tight">
							<span className="!text-technical text-muted-foreground">Current selection</span>
							<strong className="!text-control font-semibold">{currentLabel}</strong>
						</div>
						<div className="min-w-0 grid gap-grid-tight">
							<span className="!text-technical text-muted-foreground">Effective command</span>
							<code className="truncate font-mono !text-technical text-muted-foreground">
								{commandText(settings?.effectiveCommand ?? null)}
							</code>
						</div>
						<span
							className={cn(
								"opener-availability col-span-2 truncate !text-technical font-medium",
								availability?.available ? "text-status-foreground" : "text-destructive",
							)}
						>
							{availability?.available ? "Available" : (availability?.error ?? "Unavailable")}
						</span>
					</div>

					<fieldset className="opener-choices p-0 mt-region grid grid-cols-2 gap-control border-0">
						<legend className="col-span-2 mb-grid-tight font-sans !text-body font-semibold">
							Open code with
						</legend>
						<label
							className="opener-choice min-w-0 flex cursor-pointer items-start gap-control rounded-control border border-border bg-surface-raised px-control-inline py-control has-checked:border-primary has-checked:bg-primary-subtle"
							aria-label="System default opener"
						>
							<input
								className="mt-grid-tight accent-primary"
								type="radio"
								name="opener"
								value="platform"
								checked={choice === "platform"}
								onChange={choose}
							/>
							<span className="min-w-0 grid gap-grid-tight">
								<strong className="!text-body font-semibold">System default</strong>
								<small className="truncate !text-technical text-muted-foreground">
									{commandText(settings?.platformDefault ?? null)}
								</small>
							</span>
						</label>
						{PRESETS.map((preset) => (
							<label
								className="opener-choice min-w-0 flex cursor-pointer items-start gap-control rounded-control border border-border bg-surface-raised px-control-inline py-control has-checked:border-primary has-checked:bg-primary-subtle"
								aria-label={`${LABELS[preset]} opener`}
								key={preset}
							>
								<input
									className="mt-grid-tight accent-primary"
									type="radio"
									name="opener"
									value={preset}
									checked={choice === preset}
									onChange={choose}
								/>
								<span className="min-w-0 grid gap-grid-tight">
									<strong className="!text-body font-semibold">{LABELS[preset]}</strong>
									<small className="truncate !text-technical text-muted-foreground">
										{commandText(
											settings?.presets.find((item) => item.preset === preset)?.command ?? null,
										)}
									</small>
								</span>
							</label>
						))}
						<label
							className="opener-choice min-w-0 flex cursor-pointer items-start gap-control rounded-control border border-border bg-surface-raised px-control-inline py-control has-checked:border-primary has-checked:bg-primary-subtle"
							aria-label="Custom opener"
						>
							<input
								className="mt-grid-tight accent-primary"
								type="radio"
								name="opener"
								value="custom"
								checked={choice === "custom"}
								onChange={choose}
							/>
							<span className="min-w-0 grid gap-grid-tight">
								<strong className="!text-body font-semibold">Custom</strong>
								<small className="truncate !text-technical text-muted-foreground">
									Executable and ordered arguments
								</small>
							</span>
						</label>
					</fieldset>

					{choice === "custom" && (
						<section
							className="opener-custom mt-region rounded-panel border border-border bg-surface-subtle p-control-inline"
							aria-label="Custom opener"
						>
							<label className="my-control flex flex-col gap-control">
								<span className="!text-body font-semibold">Executable</span>
								<input
									className={INPUT_CLASSES}
									value={custom.executable}
									onChange={updateExecutable}
									placeholder="code or /opt/editor/bin/editor"
								/>
							</label>
							<div className="opener-arguments grid gap-control">
								<div className="opener-section-heading flex items-center justify-between gap-control !text-body font-semibold">
									<span>Arguments, in order</span>
									<Button type="button" tone="quiet" onClick={addArgument}>
										Add argument
									</Button>
								</div>
								{custom.argv.map((argument, index) => (
									<div className="opener-argument flex items-center gap-control" key={argument.id}>
										<span className="opener-index w-touch-target text-center font-mono !text-technical text-muted-foreground">
											{index + 1}
										</span>
										<input
											className={cn(INPUT_CLASSES, "min-w-0 flex-1")}
											aria-label={`Argument ${index + 1}`}
											data-argument-id={argument.id}
											value={argument.value}
											onChange={updateArgument}
										/>
										<Button
											type="button"
											tone="quiet"
											size="icon"
											aria-label={`Remove argument ${index + 1}`}
											data-argument-id={argument.id}
											onClick={removeArgument}
										>
											×
										</Button>
									</div>
								))}
							</div>
						</section>
					)}
					{validation && (
						<p className="opener-validation mt-control !text-body text-destructive" role="alert">
							{validation}
						</p>
					)}

					<label className="opener-checkout mt-region flex flex-col gap-control">
						<span className="!text-body font-semibold">Registered checkout for Test</span>
						<select
							className={INPUT_CLASSES}
							value={repository}
							onChange={chooseRepository}
							disabled={!settings?.repositories.length}
						>
							{!settings?.repositories.length && <option value="">No registered checkouts</option>}
							{settings?.repositories.map((entry) => (
								<option key={entry.repository} value={entry.repository}>
									{entry.repository}
									{entry.exists && entry.identityMatches ? "" : " (stale)"}
								</option>
							))}
						</select>
						<small className="!text-technical text-muted-foreground">
							{selectedCheckout
								? `${selectedCheckout.root}${testable ? "" : " — checkout is missing or its identity changed"}`
								: "Register a checkout before testing. Saving does not require one."}
						</small>
					</label>
				</div>

				<footer className="flex items-center justify-end gap-control border-t border-border px-panel py-region">
					<Button className="opener-reset mr-auto" tone="quiet" onClick={reset} disabled={busy}>
						{working === "reset" ? "Resetting…" : "Reset"}
					</Button>
					<Button tone="secondary" onClick={testDraft} disabled={busy || !valid || !testable}>
						{working === "test" ? "Testing…" : "Test"}
					</Button>
					<DialogClose ref={cancelRef} disabled={busy}>
						Cancel
					</DialogClose>
					<Button tone="primary" onClick={saveDraft} disabled={busy || !valid}>
						{working === "save" ? "Saving…" : "Save"}
					</Button>
				</footer>
			</DialogContent>
		</Dialog>
	);
}
