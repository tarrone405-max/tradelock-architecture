"use client";

import { useRouter } from "next/navigation";

// router.back() is client-only, so this stays a tiny leaf client component
// rather than pulling the whole (server-rendered) form into the client.
export default function BackButton() {
  const router = useRouter();

  return (
    <button
      type="button"
      onClick={() => router.back()}
      className="inline-flex items-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-900 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-900"
    >
      Back
    </button>
  );
}
