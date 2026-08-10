"use client";

import { Suspense, useActionState, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { signIn, signUp, type AuthActionState } from "@/app/actions/auth";

const initialState: AuthActionState = { error: null, message: null };

const inputClass =
  "mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900";

function LoginForm() {
  const searchParams = useSearchParams();
  const confirmationFailed = searchParams.get("error") === "confirmation-failed";

  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [signInState, signInAction, signInPending] = useActionState(signIn, initialState);
  const [signUpState, signUpAction, signUpPending] = useActionState(signUp, initialState);
  const [agreedToPlatformTerms, setAgreedToPlatformTerms] = useState(false);

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm rounded-lg border bg-white p-6 shadow-sm">
        <h1 className="text-lg font-semibold text-gray-900">TradeLock</h1>
        <p className="mt-1 text-sm text-gray-900">Contractor sign in</p>

        {confirmationFailed && (
          <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">
            That confirmation link is invalid or has expired. Please sign up again or try signing in.
          </p>
        )}

        <div className="mt-4 flex gap-2 text-sm">
          <button
            type="button"
            onClick={() => setMode("signin")}
            className={`rounded-md px-3 py-1.5 ${
              mode === "signin" ? "bg-gray-900 text-white" : "bg-gray-100 font-medium text-gray-900"
            }`}
          >
            Sign in
          </button>
          <button
            type="button"
            onClick={() => setMode("signup")}
            className={`rounded-md px-3 py-1.5 ${
              mode === "signup" ? "bg-gray-900 text-white" : "bg-gray-100 font-medium text-gray-900"
            }`}
          >
            Sign up
          </button>
        </div>

        {mode === "signin" ? (
          <form action={signInAction} className="mt-4 space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-900">Email</label>
              <input name="email" type="email" required className={inputClass} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-900">Password</label>
              <input name="password" type="password" required className={inputClass} />
            </div>
            {signInState.error && <p className="text-sm text-red-600">{signInState.error}</p>}
            <button
              type="submit"
              disabled={signInPending}
              className="w-full rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
            >
              {signInPending ? "Signing in…" : "Sign in"}
            </button>
          </form>
        ) : (
          <form action={signUpAction} className="mt-4 space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-900">Company name</label>
              <input name="companyName" type="text" required className={inputClass} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-900">Email</label>
              <input name="email" type="email" required className={inputClass} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-900">Password</label>
              <input name="password" type="password" required minLength={6} className={inputClass} />
            </div>
            <label className="flex items-start gap-2 text-xs text-gray-900">
              <input
                type="checkbox"
                name="termsAccepted"
                required
                checked={agreedToPlatformTerms}
                onChange={(e) => setAgreedToPlatformTerms(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-gray-300 text-gray-900 focus:ring-gray-900"
              />
              <span>
                I agree to the{" "}
                <Link href="/terms" target="_blank" className="font-medium underline">
                  Terms of Service
                </Link>{" "}
                and acknowledge the provider policies.
              </span>
            </label>
            {signUpState.error && <p className="text-sm text-red-600">{signUpState.error}</p>}
            {signUpState.message && <p className="text-sm text-green-600">{signUpState.message}</p>}
            <button
              type="submit"
              disabled={signUpPending || !agreedToPlatformTerms}
              className="w-full rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {signUpPending ? "Creating account…" : "Create account"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
