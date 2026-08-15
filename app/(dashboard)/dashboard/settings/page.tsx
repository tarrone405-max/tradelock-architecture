import { CheckCircle2, CreditCard } from "lucide-react";
import {
  getConnectStatus,
  openStripeExpressDashboard,
  startStripeConnectOnboarding,
} from "@/app/actions/connect";
import StripeActionButton from "@/components/StripeActionButton";

export default async function SettingsPage() {
  const connectStatus = await getConnectStatus();

  const paymentsReady =
    connectStatus.chargesEnabled &&
    connectStatus.transfersEnabled;

  const hasStripeAccount = Boolean(connectStatus.accountId);

  return (
    <div className="space-y-6">
      {/* Page heading */}
      <div className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">
          Contractor Settings
        </h1>

        <p className="text-sm text-gray-500">
          Manage your business details and how you get paid for client
          projects.
        </p>
      </div>

      {/* Payments */}
      <section className="rounded-xl border border-gray-200 bg-white p-5">
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gray-900 text-white">
            <CreditCard className="h-4 w-4" />
          </div>

          <div>
            <h2 className="text-sm font-semibold text-gray-900">
              Payments
            </h2>

            <p className="text-xs text-gray-900">
              {paymentsReady
                ? "Client change-order payments are deposited directly to your Stripe account."
                : hasStripeAccount
                  ? "Your Stripe account setup isn't completely finished yet — clients can't pay you until it is."
                  : "Connect a Stripe account so client payments can be sent directly to you."}
            </p>
          </div>
        </div>

        {paymentsReady ? (
          <div className="flex items-center justify-between gap-3 rounded-lg border border-green-200 bg-green-50 px-4 py-3">
            <span className="flex items-center gap-2 text-sm font-medium text-green-800">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              Connected — ready to accept payments
            </span>

            <StripeActionButton
              action={openStripeExpressDashboard}
              label="Manage on Stripe"
              pendingLabel="Opening…"
              className="text-xs font-semibold text-green-800 underline underline-offset-2 hover:text-green-900"
            />
          </div>
        ) : (
          <div className="space-y-3">
            {hasStripeAccount && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
                <p className="text-sm font-medium text-amber-900">
                  Finish your Stripe payment setup
                </p>

                <p className="mt-1 text-xs text-amber-800">
                  Your Stripe account can accept payment information, but
                  Stripe has not yet enabled the transfer capability required
                  for TradeLock to send your earnings to your account.
                </p>
              </div>
            )}

            <StripeActionButton
              action={startStripeConnectOnboarding}
              label={
                hasStripeAccount
                  ? "Finish setting up payments"
                  : "Connect Stripe account"
              }
              pendingLabel="Redirecting to Stripe…"
              className="rounded-lg bg-gray-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-gray-800"
            />
          </div>
        )}
      </section>
    </div>
  );
}