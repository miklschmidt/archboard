import {
	RiAddLine,
	RiArrowRightSLine,
	RiCheckLine,
	RiCloseLine,
	RiDashboardLine,
	RiDeleteBinLine,
	RiEyeLine,
	RiFolderLine,
	RiFullscreenLine,
	RiLayoutColumnLine,
	RiLockLine,
	RiMoonLine,
	RiPulseLine,
	RiRefreshLine,
	RiSettings3Line,
	RiSunLine,
	type RemixiconComponentType,
} from "@remixicon/react";
import type React from "react";

const ICONS = {
	activity: RiPulseLine,
	boards: RiDashboardLine,
	check: RiCheckLine,
	chevron: RiArrowRightSLine,
	close: RiCloseLine,
	folder: RiFolderLine,
	fullscreen: RiFullscreenLine,
	lock: RiLockLine,
	moon: RiMoonLine,
	plus: RiAddLine,
	preview: RiEyeLine,
	refresh: RiRefreshLine,
	settings: RiSettings3Line,
	split: RiLayoutColumnLine,
	sun: RiSunLine,
	trash: RiDeleteBinLine,
} as const satisfies Record<string, RemixiconComponentType>;

export type IconName = keyof typeof ICONS;

interface IconProps {
	name: IconName;
	size?: number;
	className?: string;
}

export function Icon({ name, size = 18, className }: IconProps): React.JSX.Element {
	const Component = ICONS[name];
	return <Component aria-hidden="true" focusable="false" className={className} size={size} />;
}
