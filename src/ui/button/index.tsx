import { Button as BaseButton } from "@base-ui/react/button";
import { useCallback, type ComponentProps } from "react";

import { cn } from "@/ui/ui-classnames";

type ButtonTone = "primary" | "secondary" | "quiet";
type ButtonSize = "control" | "icon";
type BaseButtonProps = Omit<BaseButton.Props, "ref"> &
	Pick<ComponentProps<typeof BaseButton>, "ref">;
type DataAttributeValue = string | number | bigint | boolean | null | undefined;
type DataAttributes = { [name: `data-${string}`]: DataAttributeValue };

export type ButtonProps = Omit<BaseButtonProps, "className"> &
	DataAttributes & {
		tone: ButtonTone;
		size?: ButtonSize;
		className?: BaseButton.Props["className"];
	};

const ROOT_CLASSES =
	"inline-flex shrink-0 items-center justify-center gap-control whitespace-nowrap rounded-control border font-sans text-sm font-medium shadow-flat outline-none select-none transition-colors duration-control ease-control data-disabled:cursor-default data-disabled:opacity-disabled-control focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring [&_svg]:pointer-events-none [&_svg]:shrink-0";

const TONE_CLASSES = {
	primary:
		"border-primary bg-primary text-primary-foreground hover:not-data-disabled:bg-primary-hover",
	secondary:
		"border-border bg-surface-subtle text-foreground hover:not-data-disabled:bg-surface-hover",
	quiet:
		"border-transparent bg-transparent text-foreground hover:not-data-disabled:border-border hover:not-data-disabled:bg-surface-hover",
} as const satisfies Record<ButtonTone, string>;

const SIZE_CLASSES = {
	control: "min-h-touch-target px-control-inline py-control",
	icon: "size-touch-target p-0",
} as const satisfies Record<ButtonSize, string>;

export function Button({ tone, size = "control", className, ...props }: ButtonProps) {
	const resolveClassName = useCallback(
		(state: BaseButton.State) =>
			cn(
				ROOT_CLASSES,
				TONE_CLASSES[tone],
				SIZE_CLASSES[size],
				typeof className === "function" ? className(state) : className,
			),
		[className, size, tone],
	);

	return <BaseButton {...props} className={resolveClassName} />;
}
