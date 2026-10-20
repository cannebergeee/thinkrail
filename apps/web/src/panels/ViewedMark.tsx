import { RiCheckLine as Check } from "@remixicon/react";
import { t } from "@/i18n";

export function ViewedMark() {
	return (
		<span
			data-testid="change-viewed"
			role="img"
			aria-label={t("Viewed")}
			title={t("Viewed")}
			className="flex size-14 shrink-0 items-center justify-center rounded-xs bg-primary text-text-on-primary"
		>
			<Check className="size-10" />
		</span>
	);
}
