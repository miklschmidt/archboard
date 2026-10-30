import { RiArrowRightSLine } from "@remixicon/react";
import { Fragment, useCallback, type JSX } from "react";
import { Button } from "@archboard/ui-kit/components";
import type { projectModel } from "@archboard/board/content";

/**
 * The trail describes containment, independently of navigation history.
 * @param props The model title, current scope, and canonical ancestors.
 * @param props.name The repository model name.
 * @param props.scope The open module, or null for repository roots.
 * @param props.trail The open module and its ancestors in display order.
 * @param props.ending What is read inside the scope, such as a flow; the scope then opens again.
 * @param props.pending Whether the picture of this destination is still on its way.
 * @param props.onOpen Navigates through the existing router.
 * @returns An accessible breadcrumb trail.
 */
function ModelBreadcrumbs(props: {
	name: string;
	scope: string | null;
	trail: ReturnType<typeof projectModel>["trail"];
	ending?: string | undefined;
	pending?: boolean;
	onOpen: (scope: string | null) => void;
}): JSX.Element {
	const items = [{ id: null, name: props.name }, ...props.trail];
	const here = props.ending === undefined ? props.scope : undefined;
	return (
		<nav
			aria-label="Module path"
			data-slot="model-breadcrumbs"
			aria-busy={props.pending === true}
			className="flex min-w-0 items-center"
		>
			{items.map((item, index) => (
				<Fragment key={item.id ?? "root"}>
					{index > 0 && <Separator />}
					<Crumb id={item.id} name={item.name} current={item.id === here} onOpen={props.onOpen} />
				</Fragment>
			))}
			{props.ending !== undefined && (
				<>
					<Separator />
					<span
						aria-current="page"
						className="text-control min-w-0 shrink-0 truncate px-2 font-medium"
					>
						{props.ending}
					</span>
				</>
			)}
		</nav>
	);
}

/**
 * The mark between two crumbs.
 * @returns The mark.
 */
function Separator(): JSX.Element {
	return (
		<RiArrowRightSLine aria-hidden="true" className="text-muted-foreground size-3.5 shrink-0" />
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
			title={props.name}
			aria-current={props.current ? "page" : undefined}
			disabled={props.current}
			onClick={open}
			className={
				props.current
					? "min-w-0 shrink-0 px-1.5 disabled:opacity-100"
					: "min-w-12 shrink truncate px-1.5"
			}
		>
			<span className="truncate">{props.name}</span>
		</Button>
	);
}

export { ModelBreadcrumbs };
