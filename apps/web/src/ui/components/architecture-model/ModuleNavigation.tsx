import { useCallback, type JSX } from "react";
import { activateCodeTarget } from "@archboard/code-opener/code-target";
import { Button } from "@archboard/ui-kit/components";
import { useModelNavigation } from "#ui/hooks/architecture-model/use-model-navigation.ts";
import type { Model } from "#ui/rules/architecture-model/projection.ts";

interface ModuleNavigationProps {
	vault: string;
	model: Model;
	module: Model["modules"][number];
	onNotice: Parameters<typeof activateCodeTarget>[0]["onNotice"];
}

/**
 * Keep source availability beside the architecture that owns its binding.
 * @param props The selected module, coherent reading, and existing notice action.
 * @returns The source action only when this module has an authored binding.
 */
function ModuleNavigation(props: ModuleNavigationProps): JSX.Element | null {
	if (props.module.binding === undefined) return null;
	return <BoundCode {...props} />;
}

/**
 * The existing opener resolves and opens the selected state on the server.
 * @param props The module binding and exact architecture context.
 * @returns One source action with pending and unavailable outcomes.
 */
function BoundCode(props: ModuleNavigationProps): JSX.Element {
	const navigation = useModelNavigation(props.vault, props.model, props.module.id);
	const { vault, onNotice } = props;
	const { model, subject, state, checkpoint } = navigation.target;
	const open = useCallback((): void => {
		activateCodeTarget({ vault, target: { model, subject, state, checkpoint }, onNotice });
	}, [vault, model, subject, state, checkpoint, onNotice]);
	return (
		<section data-slot="module-navigation" className="space-y-3">
			<Button
				variant="outline"
				data-slot="module-open-code"
				disabled={navigation.code?.ok !== true}
				onClick={open}
			>
				Open code
			</Button>
			<CodeAvailability navigation={navigation} />
		</section>
	);
}

/**
 * Missing code does not hide the selected architecture.
 * @param props The matching navigation outcome.
 * @param props.navigation The shared read and its availability.
 * @returns Progress or a concrete recovery reason beside the disabled action.
 */
function CodeAvailability({
	navigation,
}: {
	navigation: ReturnType<typeof useModelNavigation>;
}): JSX.Element | null {
	if (navigation.query.isPending || (navigation.query.isFetching && !navigation.coherent))
		return <output className="text-body text-muted-foreground">Locating source…</output>;
	if (!navigation.coherent) return <NavigationUnavailable error={navigation.query.error} />;
	return <CodeTargetAvailability target={navigation.code} />;
}

/**
 * A failed or obsolete read offers recovery without an old source action.
 * @param props The query refusal, when available.
 * @param props.error The transport or domain error.
 * @returns An explicit source availability message.
 */
function NavigationUnavailable({ error }: { error: Error | null }): JSX.Element {
	return (
		<p data-slot="module-code-unavailable" className="text-body text-muted-foreground">
			{error?.message ??
				"The reading changed while locating source. Refresh the architecture to retry."}
		</p>
	);
}

/**
 * The shared code resolver owns the source refusal and recovery text.
 * @param props The coherent source resolution.
 * @param props.target The target or explicit source failure.
 * @returns Its failure beside readable architecture, or no notice for available code.
 */
function CodeTargetAvailability({ target }: { target: Model["codeTarget"] }): JSX.Element | null {
	if (target === undefined)
		return (
			<p data-slot="module-code-unavailable" className="text-body text-muted-foreground">
				Source is unavailable for this module.
			</p>
		);
	if (target.ok) return null;
	return (
		<p
			data-slot="module-code-unavailable"
			data-code={target.code}
			className="text-body text-muted-foreground"
		>
			{target.error}
		</p>
	);
}

export { ModuleNavigation };
