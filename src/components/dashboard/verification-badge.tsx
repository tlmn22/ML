import { getDictionary } from "@/lib/i18n";
import type { LinkedAccount } from "@/lib/services/accounts";
import { Badge } from "@/components/ui/primitives";

const t = getDictionary();

export function VerificationBadge({ account }: { account: Pick<LinkedAccount, "dataSource" | "verificationMethod"> }) {
  if (account.dataSource === "mock") return <Badge tone="warning">{t.dashboard.demoBadge}</Badge>;
  if (account.verificationMethod === "manual") return <Badge tone="violet">{t.dashboard.manualBadge}</Badge>;
  return <Badge tone="success">✓ {t.dashboard.providerBadge}</Badge>;
}
