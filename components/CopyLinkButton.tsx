"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

export default function CopyLinkButton({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API unavailable (e.g. insecure context) — the portal URL
      // is still visible via this same button's title attribute.
    }
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      title={url}
      className="inline-flex items-center gap-1.5 rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-900 transition-colors hover:border-gray-300 hover:bg-gray-50 hover:text-gray-900"
    >
      {copied ? (
        <>
          <Check className="h-3.5 w-3.5 text-green-600" />
          Copied
        </>
      ) : (
        <>
          <Copy className="h-3.5 w-3.5" />
          Copy portal link
        </>
      )}
    </button>
  );
}
