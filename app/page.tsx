import Link from "next/link";
import SubheadlineRotator from "@/components/SubheadlineRotator";

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50 px-4 text-center">
      <h1 className="text-3xl font-semibold tracking-tight text-gray-900">TradeLock</h1>
      <SubheadlineRotator />
      <Link
        href="/login"
        className="mt-6 rounded-md bg-gray-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-gray-800"
      >
        Sign in
      </Link>
    </div>
  );
}
