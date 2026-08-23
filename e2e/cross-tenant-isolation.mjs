// Sprint 2 regression: verifies the property the organizations RLS audit is
// meant to guarantee — one organization can never read or mutate another
// organization's projects/change orders, including through the
// admin-client-backed Server Actions this sprint modified
// (recordOfflinePayment, countersignChangeOrder) and the PDF route.
//
// Not wired into `npm test` (Vitest) — this drives a real browser against a
// real running dev server and the live Supabase database (this project has
// no local/staging database; see AGENTS.md), so it's a manual regression
// check, not a CI-suitable unit test. Two throwaway organizations are
// created and deleted via the Supabase admin API; nothing persists.
//
// Usage:
//   1. In one terminal: PORT=3001 npm run dev   (or set E2E_BASE_URL below)
//   2. In another:      node e2e/cross-tenant-isolation.mjs

import fs from "fs";
import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright";

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3001";

const envContent = fs.readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const env = {};
for (const line of envContent.split(/\r?\n/)) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].trim();
}

const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

let failures = 0;
function log(step, ok, extra) {
  if (!ok) failures++;
  console.log(`[${ok ? "PASS" : "FAIL"}] ${step}${extra ? " — " + extra : ""}`);
}

async function makeUser(label) {
  const email = `e2e-${label}-${Date.now()}@tradelock-test.local`;
  const password = "E2E-QA-" + Math.random().toString(36).slice(2) + "!9";
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { company_name: `E2E ${label}` },
  });
  if (error) throw new Error(`createUser(${label}): ${error.message}`);
  return { email, password, userId: data.user.id };
}

async function cleanupUser(userId) {
  const { data: orgs } = await admin.from("organizations").select("id").eq("owner_id", userId);
  for (const org of orgs ?? []) {
    const { data: projects } = await admin.from("projects").select("id").eq("organization_id", org.id);
    for (const p of projects ?? []) {
      await admin.from("change_orders").delete().eq("project_id", p.id);
    }
    await admin.from("projects").delete().eq("organization_id", org.id);
    await admin.from("organization_settings").delete().eq("organization_id", org.id);
    await admin.from("organization_modules").delete().eq("organization_id", org.id);
    const { data: roles } = await admin.from("organization_roles").select("id").eq("organization_id", org.id);
    for (const r of roles ?? []) {
      await admin.from("role_permissions").delete().eq("role_id", r.id);
    }
    await admin.from("organization_members").delete().eq("organization_id", org.id);
    await admin.from("organization_roles").delete().eq("organization_id", org.id);
    await admin.from("organizations").delete().eq("id", org.id);
  }
  await admin.from("users").delete().eq("id", userId);
  await admin.auth.admin.deleteUser(userId);
}

const orgA = await makeUser("orgA");
const orgB = await makeUser("orgB");
const browser = await chromium.launch();

try {
  const pageA = await browser.newPage();
  await pageA.goto(`${BASE}/login`);
  await pageA.fill('input[name="email"]', orgA.email);
  await pageA.fill('input[name="password"]', orgA.password);
  await pageA.click('button[type="submit"]');
  await pageA.waitForURL(`${BASE}/dashboard`, { timeout: 15000 });

  const clientName = "E2E Isolation Client " + Date.now();
  await pageA.fill('input[name="clientName"]', clientName);
  await pageA.click('button:has-text("Create project")');
  await pageA.waitForTimeout(1500);
  log("Org A can create a project", (await pageA.textContent("body")).includes(clientName));

  await pageA.click(`text=${clientName}`);
  await pageA.waitForTimeout(1000);
  const projectId = pageA.url().split("/projects/")[1];

  await pageA.fill('textarea[name="description"]', "Isolation test change order");
  await pageA.fill('input[name="cost"]', "150");
  await pageA.click('button:has-text("Confirm change order")');
  await pageA.waitForTimeout(1500);
  log(
    "Org A can create a change order",
    (await pageA.textContent("body")).includes("Isolation test change order")
  );

  const { data: co } = await admin
    .from("change_orders")
    .select("id")
    .eq("project_id", projectId)
    .maybeSingle();

  // Fast-forward to "client signed" (mirrors app/p/[token]/actions.ts's
  // signChangeOrder) so the Sprint 2-modified countersign/offline-payment
  // actions have something to authorize against.
  const now = new Date().toISOString();
  await admin
    .from("change_orders")
    .update({ status: "approved", signed_at: now, client_signed_at: now, client_signature_name: "E2E Client" })
    .eq("id", co.id);
  await pageA.reload();
  await pageA.waitForTimeout(1000);

  const providerNameInput = pageA.locator('input[name="providerName"]').first();
  if (await providerNameInput.count() > 0) {
    await providerNameInput.fill("E2E Provider");
    await pageA.click('button:has-text("Countersign")');
    await pageA.waitForTimeout(1500);
  }
  const { data: coAfterCountersign } = await admin
    .from("change_orders")
    .select("provider_signed_at")
    .eq("id", co.id)
    .maybeSingle();
  log(
    "Org A owner can countersign their own change order (Sprint 2 auth fix)",
    !!coAfterCountersign?.provider_signed_at
  );

  await pageA.click('[aria-label="Record an offline payment"]');
  await pageA.waitForTimeout(300);
  await pageA.click('button:has-text("Mark Paid (Cash)")');
  await pageA.waitForTimeout(1500);
  const { data: coAfterPayment } = await admin
    .from("change_orders")
    .select("status")
    .eq("id", co.id)
    .maybeSingle();
  log(
    "Org A owner can record an offline payment on their own change order (Sprint 2 auth fix)",
    coAfterPayment?.status === "cash"
  );

  const pageB = await browser.newPage();
  await pageB.goto(`${BASE}/login`);
  await pageB.fill('input[name="email"]', orgB.email);
  await pageB.fill('input[name="password"]', orgB.password);
  await pageB.click('button[type="submit"]');
  await pageB.waitForURL(`${BASE}/dashboard`, { timeout: 15000 });

  await pageB.goto(`${BASE}/dashboard/projects/${projectId}`);
  await pageB.waitForTimeout(1000);
  const orgBBody = await pageB.textContent("body");
  log(
    "Org B cannot view Org A's project via direct URL",
    !orgBBody.includes(clientName) && !orgBBody.includes("Isolation test change order")
  );

  const pdfResp = await pageB.request.get(`${BASE}/api/pdf/change-order/${co.id}`);
  log(
    "Org B cannot download Org A's change-order PDF",
    pdfResp.status() === 403 || pdfResp.status() === 404,
    `status=${pdfResp.status()}`
  );

  await browser.close();
} finally {
  await cleanupUser(orgA.userId);
  await cleanupUser(orgB.userId);
}

if (failures > 0) {
  console.error(`\n${failures} check(s) failed.`);
  process.exit(1);
}
console.log("\nAll checks passed.");
