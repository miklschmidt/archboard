// The account section: signed in, signed out with a sign-in action, or a
// login in progress with its page and a cancel.

import { useCallback, useId, useState } from "react";

import type { BrowserAccount, BrowserLogin } from "@/shared/codex-browser-model";
import type {
	AgentSettingsBusy,
	LoginId,
	LoginVariant,
	PendingLogin,
} from "@/ui/agent-settings/lib/contracts";
import {
	LOGIN_VARIANTS,
	describeAccount,
	describeLoginOutcome,
	loginVariantLabel,
	pendingLogin,
} from "@/ui/agent-settings/lib/presentation";
import { SectionHeading, StateBadge } from "@/ui/agent-settings/lib/section-parts";
import { BusyText, DialogErrorAlert, Technical, type DialogError } from "@/ui/board-dialogs";
import { Button } from "@/ui/components/button";
import { Field, FieldLabel } from "@/ui/components/field";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/ui/components/select";

/** The sign-in variants with the words the select shows for each. */
const LOGIN_ITEMS: ReadonlyArray<{ value: LoginVariant; label: string }> = LOGIN_VARIANTS.map(
	(variant) => ({ value: variant, label: loginVariantLabel(variant) }),
);

/** Inputs for the sign-in form. */
interface SignInFormProps {
	busy: boolean;
	onSignIn: (variant: LoginVariant) => void;
}

/**
 * Choose a sign-in variant and start it.
 * @param props The busy state and the callback.
 * @returns A select and a button.
 */
function SignInForm(props: SignInFormProps): React.JSX.Element {
	const id = useId();
	const { onSignIn } = props;
	const [variant, setVariant] = useState<LoginVariant>("chatgpt");
	const handleVariant = useCallback((value: LoginVariant | null) => {
		if (value !== null) {
			setVariant(value);
		}
	}, []);
	const handleSignIn = useCallback(() => onSignIn(variant), [onSignIn, variant]);
	return (
		<div className="flex items-end gap-2">
			<Field className="flex-1">
				<FieldLabel htmlFor={id}>Sign in with</FieldLabel>
				<Select
					items={LOGIN_ITEMS}
					value={variant}
					onValueChange={handleVariant}
					disabled={props.busy}
				>
					<SelectTrigger id={id} className="w-full">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						{LOGIN_VARIANTS.map((entry) => (
							<SelectItem key={entry} value={entry}>
								{loginVariantLabel(entry)}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			</Field>
			<Button disabled={props.busy} onClick={handleSignIn}>
				Sign in
			</Button>
		</div>
	);
}

/** Inputs for the login in progress. */
interface PendingLoginProps {
	login: PendingLogin;
	busy: boolean;
	onCancelLogin: (loginId: LoginId) => void;
}

/**
 * A login in progress: its page, when the variant has one, and a cancel.
 * @param props The pending login, the busy state and the callback.
 * @returns The line and the button.
 */
function PendingLoginView(props: PendingLoginProps): React.JSX.Element {
	const { login, onCancelLogin } = props;
	const handleCancel = useCallback(
		() => onCancelLogin(login.loginId),
		[onCancelLogin, login.loginId],
	);
	return (
		<div className="grid gap-2 text-sm">
			<p>
				Signing in with {loginVariantLabel(login.variant)} · <Technical>{login.loginId}</Technical>
			</p>
			{login.authUrl !== null && (
				<a href={login.authUrl} target="_blank" rel="noreferrer" className="underline">
					Open the sign-in page
				</a>
			)}
			<Button
				variant="outline"
				size="sm"
				className="w-fit"
				disabled={props.busy}
				onClick={handleCancel}
			>
				Cancel sign-in
			</Button>
		</div>
	);
}

/** Inputs for the action the account state calls for. */
interface AccountActionProps {
	account: BrowserAccount;
	pending: PendingLogin | null;
	busy: AgentSettingsBusy;
	onSignIn: (variant: LoginVariant) => void;
	onCancelLogin: (loginId: LoginId) => void;
}

/**
 * The one action the state calls for: cancel a pending login, or sign in
 * when signed out. A ready account has nothing to do here.
 * @param props The account, the pending login and the callbacks.
 * @returns The action, or nothing.
 */
function AccountAction(props: AccountActionProps): React.JSX.Element | null {
	if (props.pending) {
		return (
			<PendingLoginView
				login={props.pending}
				busy={props.busy.cancelLogin}
				onCancelLogin={props.onCancelLogin}
			/>
		);
	}
	if (props.account.state === "ready" || props.account.state === "login_pending") {
		return null;
	}
	return <SignInForm busy={props.busy.signIn} onSignIn={props.onSignIn} />;
}

/** Inputs for the account section. */
interface AccountSectionProps {
	account: BrowserAccount;
	login: BrowserLogin;
	busy: AgentSettingsBusy;
	error: DialogError | null;
	onSignIn: (variant: LoginVariant) => void;
	onCancelLogin: (loginId: LoginId) => void;
}

/**
 * The account section.
 * @param props The account and login records, the state and the callbacks.
 * @returns The section.
 */
function AccountSection(props: AccountSectionProps): React.JSX.Element {
	const summary = describeAccount(props.account);
	const outcome = describeLoginOutcome(props.login);
	return (
		<section className="grid gap-3">
			<SectionHeading title="Account">
				<StateBadge summary={summary} />
			</SectionHeading>
			{outcome !== null && <p className="text-muted-foreground text-sm">{outcome}</p>}
			<AccountAction
				account={props.account}
				pending={pendingLogin(props.login)}
				busy={props.busy}
				onSignIn={props.onSignIn}
				onCancelLogin={props.onCancelLogin}
			/>
			<DialogErrorAlert error={props.error} />
			<BusyText busy={props.busy.signIn} text="Starting sign-in…" />
			<BusyText busy={props.busy.cancelLogin} text="Cancelling sign-in…" />
		</section>
	);
}

export { AccountSection, type AccountSectionProps };
