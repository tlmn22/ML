"use client";

import { getDictionary } from "@/lib/i18n";
import { Button, EmptyState } from "@/components/ui/primitives";

const t = getDictionary();

export default function ErrorBoundary({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <EmptyState title={t.common.unknownError} action={<Button onClick={reset}>{t.common.retry}</Button>} />;
}
