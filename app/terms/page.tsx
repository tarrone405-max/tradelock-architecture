import Link from "next/link";
import { PLATFORM_TERMS_VERSION } from "@/lib/platformTerms";

export const metadata = {
  title: "Terms of Service — TradeLock",
};

export default function PlatformTermsPage() {
  return (
    <div className="min-h-screen bg-gray-50 px-4 py-12">
      <div className="mx-auto max-w-2xl space-y-6 rounded-xl border border-gray-200 bg-white p-8">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">TradeLock Terms of Service</h1>
          <p className="mt-1 text-xs text-gray-500">
            Version {PLATFORM_TERMS_VERSION} — provider policies for contractor accounts
          </p>
        </div>

        <div className="space-y-4 text-sm leading-relaxed text-gray-900">
          <p>
            These Terms of Service govern a contractor&rsquo;s (&ldquo;Provider&rdquo;) use of
            TradeLock as a platform for sending clients a portal to review, digitally sign, and
            pay for change orders. By registering an account or checking the acceptance box, you agree to be legally bound by these terms.
          </p>

          <section>
            <h2 className="font-semibold text-gray-900">1. Nature of the Platform & Limitation of Liability</h2>
            <p className="mt-1">
              TradeLock is strictly a software-as-a-service (SaaS) tool designed to facilitate digital documentation, change order approvals, and record-keeping. TradeLock is not a party to any contract, service agreement, or commercial transaction between Providers and their clients. To the maximum extent permitted by law, TradeLock and its developers shall not be liable for any indirect, incidental, special, consequential, or punitive damages, or project disputes arising out of your use of the platform.
            </p>
          </section>

          <section>
            <h2 className="font-semibold text-gray-900">2. Provider responsibilities</h2>
            <p className="mt-1">
              Providers are solely responsible for the accuracy of the projects, change orders,
              costs, and Terms of Service content they create in TradeLock, and for their
              underlying service agreements with clients. TradeLock records digital signatures
              and payment status but does not guarantee the performance or legal enforceability of individual contractor agreements.
            </p>
          </section>

          <section>
            <h2 className="font-semibold text-gray-900">3. Indemnification</h2>
            <p className="mt-1">
              You agree to defend, indemnify, and hold harmless TradeLock, its owners, and affiliates from any claims, liabilities, damages, losses, or expenses (including legal fees) arising out of your breach of these terms, your use of the platform, or any disputes between you and your clients or subcontractors.
            </p>
          </section>

          <section>
            <h2 className="font-semibold text-gray-900">4. Account and billing</h2>
            <p className="mt-1">
              Provider accounts include a free trial period, after which continued access
              requires an active paid subscription. Subscriptions are billed in advance and
              processed by Stripe; TradeLock does not store payment card details directly.
            </p>
          </section>

          <section>
            <h2 className="font-semibold text-gray-900">5. Client data and compliance</h2>
            <p className="mt-1">
              Providers may only submit client information they are authorized to collect and
              use for the purpose of requesting change-order approval and payment, and must ensure compliance with local contracting laws.
            </p>
          </section>

          <section>
            <h2 className="font-semibold text-gray-900">6. Changes to these terms</h2>
            <p className="mt-1">
              TradeLock may update these terms from time to time. Material changes will be
              reflected in a new version number, and continued use of the platform after a
              change constitutes acceptance of the updated terms.
            </p>
          </section>
        </div>

        <div className="border-t border-gray-100 pt-4">
          <Link href="/login" className="text-sm font-medium text-gray-900 hover:underline">
            &larr; Back to sign up
          </Link>
        </div>
      </div>
    </div>
  );
}