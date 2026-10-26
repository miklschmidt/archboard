import { useCallback, type JSX } from "react";
import { Button } from "@archboard/ui-kit/components";
import type { projectModel } from "#ui/rules/architecture-model/projection.ts";

/**
 * The trail describes containment, independently of navigation history.
 * @param props The model title, current scope, and canonical ancestors.
 * @param props.name The repository model name.
 * @param props.scope The open module, or null for repository roots.
 * @param props.trail The open module and its ancestors in display order.
 * @param props.onOpen Navigates through the existing router.
 * @returns An accessible breadcrumb trail.
 */
function ModelBreadcrumbs(props: {
	name: string;
	scope: string | null;
	trail: ReturnType<typeof projectModel>["trail"];
	onOpen: (scope: string | null) => void;
}): JSX.Element {
	const items = [{ id: null, name: props.name }, ...props.trail];
	return (
		<nav
			aria-label="Module path"
			data-slot="model-breadcrumbs"
			className="border-border flex shrink-0 items-center gap-1 border-b px-4 py-2"
		>
			{items.map((item) => (
				<Crumb
					key={item.id ?? "root"}
					id={item.id}
					name={item.name}
					current={item.id === props.scope}
					onOpen={props.onOpen}
				/>
			))}
		</nav>
	);
}

/**
 * Each crumb opens its existing module identity.
 * @param props The destination and current-state indication.
 * @param props.id The destination identity, or null for roots.
 * @param props.name Its authored name.
 * @param props.current Whether this destination is already open.
 * @param props.onOpen The navigation action.
 * @returns One keyboard-accessible destination.
 */
function Crumb(props: {
	id: string | null;
	name: string;
	current: boolean;
	onOpen: (scope: string | null) => void;
}): JSX.Element {
	const { id, onOpen } = props;
	const open = useCallback((): void => onOpen(id), [id, onOpen]);
	return (
		<Button
			variant="ghost"
			size="sm"
			data-scope-id={id ?? ""}
			aria-current={props.current ? "page" : undefined}
			disabled={props.current}
			onClick={open}
		>
			{props.name}
		</Button>
	);
}

export { ModelBreadcrumbs };
