// Admin-only tool for publishing a provider's client-facing Terms of Service.
//
// This used to be a form on /dashboard/settings that any provider could use
// to write and publish their own legal terms — removed because letting
// contractors author unvetted legal text for their clients to sign was a
// liability risk. Terms are now pushed by whoever runs TradeLock, from the
// codebase, using this script and the service-role key. Never exposed over
// HTTP or to a provider's session.
//
// Usage:
//   node scripts/publish-terms.mjs <provider-email> <path-to-terms.txt>

import { readFileSync } from "fs";
import { createClient } from "@supabase/supabase-js";

const [, , providerEmail, contentPath] = process.argv;

if (!providerEmail || !contentPath) {
  console.error("Usage: node scripts/publish-terms.mjs <provider-email> <path-to-terms.txt>");
  process.exit(1);
}

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter((line) => line.includes("="))
    .map((line) => {
      const i = line.indexOf("=");
      return [line.slice(0, i).trim(), line.slice(i + 1).trim()];
    })
);

const content = readFileSync(contentPath, "utf8").trim();
if (!content) {
  console.error(`${contentPath} is empty.`);
  process.exit(1);
}

const supabaseAdmin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const { data: provider, error: providerError } = await supabaseAdmin
  .from("users")
  .select("id, company_name")
  .eq("email", providerEmail)
  .maybeSingle();

if (providerError) {
  console.error(`Could not look up provider: ${providerError.message}`);
  process.exit(1);
}
if (!provider) {
  console.error(`No provider found with email ${providerEmail}`);
  process.exit(1);
}

const { data: current, error: currentError } = await supabaseAdmin
  .from("terms_of_service")
  .select("id, version")
  .eq("user_id", provider.id)
  .eq("is_active", true)
  .maybeSingle();

if (currentError) {
  console.error(`Could not read current terms: ${currentError.message}`);
  process.exit(1);
}

if (current) {
  const { error: deactivateError } = await supabaseAdmin
    .from("terms_of_service")
    .update({ is_active: false })
    .eq("id", current.id);
  if (deactivateError) {
    console.error(`Could not deactivate previous version: ${deactivateError.message}`);
    process.exit(1);
  }
}

const nextVersion = (current?.version ?? 0) + 1;

const { error: insertError } = await supabaseAdmin.from("terms_of_service").insert({
  user_id: provider.id,
  version: nextVersion,
  content,
  is_active: true,
});

if (insertError) {
  console.error(`Could not publish new version: ${insertError.message}`);
  process.exit(1);
}

console.log(`Published Terms of Service v${nextVersion} for ${provider.company_name} (${providerEmail}).`);
