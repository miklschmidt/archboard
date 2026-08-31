import { Dialog as BaseDialog } from "@base-ui/react/dialog";
import { createElement, type ComponentProps, type ElementType } from "react";

import { Button } from "@/ui/button";
import { cn } from "@/ui/ui-classnames";

type DataAttributeValue = string | number | bigint | boolean | null | undefined;
type DataAttributes = { [name: `data-${string}`]: DataAttributeValue } & {
	"data-slot"?: never;
};
type WithRef<Props, Component extends ElementType> = Omit<Props, "ref"> &
	Pick<ComponentProps<Component>, "ref">;
type StatefulClassName<State> = string | ((state: State) => string | undefined) | undefined;

const BACKDROP_CLASSES = "fixed inset-0 z-50 bg-background/60";
const POPUP_CLASSES =
	"fixed top-1/2 left-1/2 z-50 flex max-h-full max-w-full -translate-x-1/2 -translate-y-1/2 flex-col gap-region overflow-auto rounded-dialog border border-border bg-surface-raised p-panel font-sans !text-body text-foreground shadow-flat outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring";
const TITLE_CLASSES = "font-sans !text-title font-semibold text-foreground";
const DESCRIPTION_CLASSES = "font-sans !text-body text-muted-foreground";
const CLOSE_CLASSES = "border-border bg-surface-subtle text-foreground";

function composeClasses<State>(
	base: string,
	className: StatefulClassName<State>,
): string | ((state: State) => string) {
	if (typeof className === "function") {
		return (state) => cn(base, className(state));
	}
	return cn(base, className);
}

type BaseRootProps = BaseDialog.Root.Props;
type RootOpenChange = NonNullable<BaseRootProps["onOpenChange"]>;
type BasePopupProps = Omit<BaseDialog.Popup.Props, "aria-describedby" | "aria-labelledby" | "role">;

export type DialogProps = Omit<
	BaseRootProps,
	| "actionsRef"
	| "defaultOpen"
	| "defaultTriggerId"
	| "disablePointerDismissal"
	| "handle"
	| "modal"
	| "onOpenChange"
	| "open"
	| "triggerId"
> & {
	open: boolean;
	onOpenChange: RootOpenChange;
};

export type DialogContentProps = WithRef<BasePopupProps, typeof BaseDialog.Popup> & DataAttributes;
export type DialogTitleProps = WithRef<BaseDialog.Title.Props, typeof BaseDialog.Title> &
	DataAttributes;
export type DialogDescriptionProps = WithRef<
	BaseDialog.Description.Props,
	typeof BaseDialog.Description
> &
	DataAttributes;
export type DialogCloseProps = Omit<
	WithRef<BaseDialog.Close.Props, typeof BaseDialog.Close>,
	"nativeButton" | "render"
> &
	DataAttributes;

export function Dialog(props: DialogProps) {
	return <BaseDialog.Root {...props} modal={true} disablePointerDismissal={false} />;
}

export function DialogContent({ className, ...props }: DialogContentProps) {
	return (
		<BaseDialog.Portal>
			<BaseDialog.Backdrop className={BACKDROP_CLASSES} />
			<BaseDialog.Popup
				{...props}
				className={composeClasses<BaseDialog.Popup.State>(POPUP_CLASSES, className)}
			/>
		</BaseDialog.Portal>
	);
}

export function DialogTitle({ className, ...props }: DialogTitleProps) {
	return (
		<BaseDialog.Title
			{...props}
			className={composeClasses<BaseDialog.Title.State>(TITLE_CLASSES, className)}
		/>
	);
}

export function DialogDescription({ className, ...props }: DialogDescriptionProps) {
	return (
		<BaseDialog.Description
			{...props}
			className={composeClasses<BaseDialog.Description.State>(DESCRIPTION_CLASSES, className)}
		/>
	);
}

export function DialogClose({ className, ...props }: DialogCloseProps) {
	const button = createElement(Button, {
		tone: "secondary",
		className: composeClasses<BaseDialog.Close.State>(CLOSE_CLASSES, className),
	});
	return <BaseDialog.Close {...props} render={button} />;
}
