"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { usePathname } from "next/navigation";

export default function BackToDashboard() {
  const pathname = usePathname();

  // Don't show the button when we're already on the dashboard.
  if (pathname === "/dashboard") {
    return null;
  }

  return (
    <div className="mb-5">
      <Link
        href="/dashboard"
        className="inline-flex items-center gap-2 text-sm font-medium text-gray-600 transition-colors hover:text-gray-900"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Dashboard
      </Link>
    </div>
  );
}