import { useCallback, type ComponentProps, type JSX } from "react";
import { activateCodeTarget } from "@archboard/code-opener/code-target";
import { Button } from "@archboard/ui-kit/components";
import { useModelNavigation } from "#ui/hooks/architecture-model/use-model-navigation.ts";
import type { Model } from "@archboard/model/content";
import { ModuleReferences } from "#ui/components/architecture-model/ModuleReferences.tsx";

interface ModuleNavigationProps {
	vault: string;
	paneId: string;
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
	if (props.module.binding === undefined && !props.module.references?.length) return null;
	return <NavigationControls {...props} />;
}

/**
 * The action that opens a module's code, for a place with no room for its references.
 * @param props The selected module and exact reading context.
 * @returns The action, or nothing for a module with no binding.
 */
function ModuleOpenCode(props: ModuleNavigationProps): JSX.Element | null {
	if (props.module.binding === undefined) return null;
	return <OpenCode {...props} />;
}

/**
 * The architectures a module refers to, for a place with no room for the rest of its navigation.
 * @param props The selected module and exact reading context.
 * @returns The references, or nothing for a module with none.
 */
function ModuleOpenReferences(props: ModuleNavigationProps): JSX.Element | null {
	if (props.module.references === undefined || props.module.references.length === 0) return null;
	return <OpenReferences {...props} references={props.module.references} />;
}

/**
 * The references of a module, on their own read of it.
 * @param props The module and its references.
 * @returns The references.
 */
function OpenReferences(
	props: ModuleNavigationProps & Pick<ComponentProps<typeof ModuleReferences>, "references">,
): JSX.Element {
	const navigation = useModelNavigation(props.vault, props.model, props.module);
	return (
		<ModuleReferences
			key={JSON.stringify([props.vault, navigation.target, props.model.revision.digest])}
			paneId={props.paneId}
			references={props.references}
			navigation={navigation}
		/>
	);
}

/**
 * One source action, on its own read of the module.
 * @param props The bound module.
 * @returns The action.
 */
function OpenCode(props: ModuleNavigationProps): JSX.Element {
	const navigation = useModelNavigation(props.vault, props.model, props.module);
	return <BoundCode {...props} navigation={navigation} />;
}

/**
 * Source and architecture links share one coherent navigation read.
 * @param props The selected module and exact reading context.
 * @returns Only the actions the module actually authors.
 */
function NavigationControls(props: ModuleNavigationProps): JSX.Element {
	const navigation = useModelNavigation(props.vault, props.model, props.module);
	const references = props.module.references;
	return (
		<section data-slot="module-navigation" className="space-y-6">
			{props.module.binding !== undefined && <BoundCode {...props} navigation={navigation} />}
			{references !== undefined && references.length > 0 && (
				<ModuleReferences
					key={JSON.stringify([props.vault, navigation.target, props.model.revision.digest])}
					paneId={props.paneId}
					references={references}
					navigation={navigation}
				/>
			)}
		</section>
	);
}

/**
 * The existing opener resolves and opens the selected state on the server.
 * @param props The module binding and exact architecture context.
 * @returns One source action with pending and unavailable outcomes.
 */
function BoundCode(
	props: ModuleNavigationProps & { navigation: ReturnType<typeof useModelNavigation> },
): JSX.Element {
	const { navigation } = props;
	const { vault, onNotice } = props;
	const { model, subject, state, checkpoint, preview } = navigation.target;
	const open = useCallback((): void => {
		activateCodeTarget({ vault, target: { model, subject, state, checkpoint, preview }, onNotice });
	}, [vault, model, subject, state, checkpoint, preview, onNotice]);
	return (
		<div className="space-y-3">
			<Button
				variant="outline"
				data-slot="module-open-code"
				disabled={navigation.code?.ok !== true}
				onClick={open}
			>
				Open code
			</Button>
			<CodeAvailability navigation={navigation} />
		</div>
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

export { ModuleNavigation, ModuleOpenCode, ModuleOpenReferences };
