"use client";

import { useState } from "react";
import { getDictionary } from "@/lib/i18n";
import { Button } from "@/components/ui/primitives";

const t = getDictionary();

export function ShareButton({ title, path }: { title: string; path: string }) {
  const [copied, setCopied] = useState(false);

  async function share() {
    const url = new URL(path, window.location.origin).toString();
    if (navigator.share) {
      await navigator.share({ title, url }).catch(() => undefined);
      return;
    }
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <Button variant="secondary" size="sm" onClick={share}>
      {copied ? `✓ ${t.common.copied}` : `↗ ${t.common.share}`}
    </Button>
  );
}
