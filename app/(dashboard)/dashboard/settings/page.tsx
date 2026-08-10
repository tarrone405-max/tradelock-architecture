import { CheckCircle2, CreditCard } from "lucide-react";
import {
  getConnectStatus,
  openStripeExpressDashboard,
  startStripeConnectOnboarding,
} from "@/app/actions/connect";

export default async function SettingsPage() {
  const connectStatus = await getConnectStatus();

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h2 className="text-2xl font-bold tracking-tight text-gray-900">Contractor Settings</h2>
        <p className="text-sm text-gray-500">
          Manage your business details and how you get paid for client projects.
        </p>
      </div>

      <section className="rounded-xl border border-gray-200 bg-white p-5">
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gray-900 text-white">
            <CreditCard className="h-4 w-4" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-gray-900">Payments</h2>
            <p className="text-xs text-gray-900">
              {connectStatus.chargesEnabled
                ? "Client change-order payments are deposited directly to your bank account."
                : connectStatus.accountId
                  ? "Your Stripe account setup isn't finished yet — clients can't pay you until it is."
                  : "Connect a Stripe account so client payments go straight to you, not TradeLock."}
            </p>
          </div>
        </div>

        {connectStatus.chargesEnabled ? (
          <div className="flex items-center justify-between gap-3 rounded-lg border border-green-200 bg-green-50 px-4 py-3">
            <span className="flex items-center gap-2 text-sm font-medium text-green-800">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              Connected — ready to accept payments
            </span>
            <form action={openStripeExpressDashboard}>
              <button
                type="submit"
                className="text-xs font-semibold text-green-800 underline underline-offset-2 hover:text-green-900"
              >
                Manage on Stripe
              </button>
            </form>
          </div>
        ) : (
          <form action={startStripeConnectOnboarding}>
            <button
              type="submit"
              className="rounded-lg bg-gray-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-gray-800"
            >
              {connectStatus.accountId ? "Finish setting up payments" : "Connect Stripe account"}
            </button>
          </form>
        )}
      </section>
    </div>
  );
}
