import { RiArrowRightSLine } from "@remixicon/react";
import { Fragment, useCallback, type JSX } from "react";
import { Button } from "@archboard/ui-kit/components";
import type { projectModel } from "@archboard/model/content";

/**
 * The trail describes containment, independently of navigation history. A flow or a walkthrough
 * crosses modules, so its name stands beside the trail and not on it: the open module says where
 * the reader came from and gives the way back, and it does not own what is read.
 * @param props The model title, current scope, and canonical ancestors.
 * @param props.name The repository model name.
 * @param props.scope The open module, or null for repository roots.
 * @param props.trail The open module and its ancestors in display order.
 * @param props.ending What is read from the scope, such as a flow; the scope then opens again.
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
		<div className="flex min-w-16 items-center">
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
			</nav>
			{props.ending !== undefined && (
				<>
					<span aria-hidden="true" className="text-muted-foreground shrink-0">
						·
					</span>
					<span
						aria-current="page"
						data-slot="model-reading-name"
						className="text-control min-w-0 shrink-0 truncate px-2 font-medium"
					>
						{props.ending}
					</span>
				</>
			)}
		</div>
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
			// A crumb is a way through the model, set as the site sets its nav links: medium, not the
			// semibold of a button's words.
			className={
				props.current
					? "min-w-0 shrink-0 px-1.5 font-medium disabled:opacity-100"
					: "min-w-12 shrink truncate px-1.5 font-medium"
			}
		>
			<span className="truncate">{props.name}</span>
		</Button>
	);
}

export { ModelBreadcrumbs };
