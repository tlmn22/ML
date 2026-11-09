import { getDictionary } from "@/lib/i18n";
import { ButtonLink, EmptyState } from "@/components/ui/primitives";

const t = getDictionary();

export default function NotFound() {
  return <EmptyState title="404" body={t.common.notFound} action={<ButtonLink href="/">{t.nav.home}</ButtonLink>} />;
}
