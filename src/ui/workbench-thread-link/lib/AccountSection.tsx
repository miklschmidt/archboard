import { useCallback, useId, useState, type ChangeEvent, type ReactNode } from "react";

import { Button } from "@/ui/button";
import { cn } from "@/ui/ui-classnames";

import { buildThreadLinkLogin, threadLinkAccountForm } from "./account.js";
import type {
	ThreadLinkAccountDisclosure,
	ThreadLinkAccountFormId,
	ThreadLinkController,
} from "./contract.js";

const STATE_CLASSES = {
	unknown: "text-muted-foreground",
	signed_out: "text-warning",
	login_pending: "text-muted-foreground",
	ready: "text-muted-foreground",
	failed: "text-destructive",
} as const satisfies Record<ThreadLinkAccountDisclosure["state"], string>;

const FIELD_CLASSES =
	"min-h-touch-target w-full rounded-control border border-input bg-surface-raised px-control py-control font-mono text-technical text-foreground outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring";

export interface AccountSectionProps {
	readonly sectionId: string;
	readonly account: ThreadLinkAccountDisclosure;
	readonly controller: ThreadLinkController;
	readonly initialForm?: ThreadLinkAccountFormId;
}

function isFormId(value: string): value is ThreadLinkAccountFormId {
	return (
		value === "apiKey" ||
		value === "chatgpt" ||
		value === "amazonBedrock" ||
		value === "amazonBedrockAccessKeys"
	);
}

export function AccountSection({
	sectionId,
	account,
	controller,
	initialForm,
}: AccountSectionProps): ReactNode {
	const headingId = useId();
	const groupId = useId();
	const validationId = useId();
	const [formId, setFormId] = useState<ThreadLinkAccountFormId>(initialForm ?? "apiKey");
	const [values, setValues] = useState<Readonly<Record<string, string>>>({});
	const [validation, setValidation] = useState<string | null>(null);
	const form = threadLinkAccountForm(formId);
	const changeForm = useCallback((event: ChangeEvent<HTMLInputElement>) => {
		const next = event.target.value;
		if (!isFormId(next)) return;
		setFormId(next);
		setValues({});
		setValidation(null);
	}, []);
	const changeField = useCallback((event: ChangeEvent<HTMLInputElement>) => {
		const name = event.target.dataset.threadLinkField;
		const next = event.target.value;
		if (name === undefined) return;
		setValues((current) => ({ ...current, [name]: next }));
	}, []);
	const submit = useCallback(() => {
		const built = buildThreadLinkLogin(formId, values);
		if (!built.ok) {
			setValidation(built.reason);
			return;
		}
		setValidation(null);
		void controller.login(built.login);
	}, [controller, formId, values]);
	const cancel = useCallback(() => {
		if (account.pendingLoginId !== null) void controller.cancelLogin(account.pendingLoginId);
	}, [account.pendingLoginId, controller]);
	const signOut = useCallback(() => {
		void controller.logout();
	}, [controller]);
	const signedIn = account.state === "ready";
	return (
		<details
			open={!signedIn}
			aria-labelledby={headingId}
			className="min-w-0 border-t border-border pt-control"
			data-thread-link-account={account.state}
			id={sectionId}
		>
			<summary className="flex min-h-touch-target cursor-pointer items-center justify-between gap-control outline-none focus-visible:outline-2 focus-visible:outline-ring">
				<h3 className="m-0 text-body font-medium" id={headingId}>
					Account
				</h3>
				<output
					aria-atomic="true"
					aria-label={`Codex account: ${account.label}`}
					aria-live="polite"
					className={cn("shrink-0 !text-body", STATE_CLASSES[account.state])}
				>
					{account.label}
				</output>
			</summary>
			<p className="m-0 pb-control text-body text-muted-foreground">{account.detail}</p>
			{signedIn ? null : (
				<fieldset aria-describedby={groupId} className="m-0 border-0 p-0">
					<legend className="text-kicker font-semibold text-muted-foreground">Sign in with</legend>
					<p className="m-0 pb-control text-body text-muted-foreground" id={groupId}>
						{form.description}
					</p>
					<div className="flex flex-wrap gap-control-inline pb-control">
						{account.forms.map((candidate) => (
							<label
								className="flex min-h-touch-target items-center gap-control text-body text-foreground"
								key={candidate.id}
							>
								<input
									checked={candidate.id === formId}
									data-thread-link-form-option={candidate.id}
									name={`${groupId}-form`}
									onChange={changeForm}
									type="radio"
									value={candidate.id}
								/>
								<span>{candidate.label}</span>
							</label>
						))}
					</div>
					<div className="grid grid-cols-2 gap-control pb-control" data-thread-link-form={formId}>
						{form.fields.map((field) => (
							<label className="min-w-0" key={field.name}>
								<span className="block text-kicker font-semibold text-muted-foreground">
									{field.label}
								</span>
								<input
									autoComplete="off"
									className={FIELD_CLASSES}
									data-thread-link-field={field.name}
									onChange={changeField}
									required={field.required}
									type={field.secret ? "password" : "text"}
									value={values[field.name] ?? ""}
								/>
								<span className="mt-compact block text-body text-muted-foreground">
									{field.description}
								</span>
							</label>
						))}
					</div>
				</fieldset>
			)}
			{validation === null ? null : (
				<p className="m-0 pb-control text-body text-destructive" id={validationId} role="alert">
					{validation}
				</p>
			)}
			<div className="flex flex-wrap items-center gap-control pb-control">
				{signedIn ? null : (
					<>
						<Button
							aria-describedby={validation === null ? undefined : validationId}
							disabled={!account.canLogin}
							onClick={submit}
							tone="primary"
							type="button"
						>
							Sign in
						</Button>
						<Button
							disabled={!account.canCancelLogin || account.pendingLoginId === null}
							onClick={cancel}
							tone="secondary"
							type="button"
						>
							Cancel sign-in
						</Button>
					</>
				)}
				<Button disabled={!account.canLogout} onClick={signOut} tone="quiet" type="button">
					Sign out
				</Button>
			</div>
			{signedIn || account.blockedReason === null ? null : (
				<p className="m-0 pb-control text-body text-muted-foreground">{account.blockedReason}</p>
			)}
			{signedIn ? null : (
				<details className="border-t border-border-subtle pt-control">
					<summary className="min-h-touch-target cursor-pointer text-body font-medium text-muted-foreground outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
						Sign-in help
					</summary>
					<dl className="m-0">
						{account.unavailable.map((method) => (
							<div
								className="grid grid-cols-[minmax(9rem,0.6fr)_minmax(0,1.4fr)] gap-control border-t border-border-subtle py-compact first:border-t-0"
								data-thread-link-unavailable={method.id}
								key={method.id}
							>
								<dt className="text-body font-medium text-foreground">{method.label}</dt>
								<dd className="m-0 text-body text-muted-foreground">{method.explanation}</dd>
							</div>
						))}
					</dl>
				</details>
			)}
		</details>
	);
}
