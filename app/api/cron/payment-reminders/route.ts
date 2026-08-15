import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/resend";
import NotificationEmail from "@/emails/NotificationEmail";
import { isPlanTier, planHasFeature } from "@/lib/plans";

export const runtime = "nodejs";

// Daily automated payment-due reminder emails — a Pro+ feature
// (lib/plans.ts's automatedReminders flag; Free providers have to remind
// clients themselves). Triggered by Vercel Cron once a day (see
// vercel.json), protected by CRON_SECRET so the URL can't be triggered by
// anyone who happens to find it — Vercel Cron sends this as a Bearer token
// automatically when CRON_SECRET is set in the project's environment.
export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.error("Missing CRON_SECRET environment variable");
    return NextResponse.json({ error: "Not configured" }, { status: 500 });
  }

  if (request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabaseAdmin = getSupabaseAdmin();
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const reminderWindow = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  // Approved (signed, awaiting payment) change orders due within 3 days —
  // including already overdue — that haven't been reminded in the last day.
  const { data: candidates, error } = await supabaseAdmin
    .from("change_orders")
    .select("id, description, cost, due_date, project_id, last_reminder_sent_at")
    .eq("status", "approved")
    .not("due_date", "is", null)
    .lte("due_date", reminderWindow)
    .or(`last_reminder_sent_at.is.null,last_reminder_sent_at.lt.${oneDayAgo}`);

  if (error) {
    console.error("Failed to load payment reminder candidates:", error.message);
    return NextResponse.json({ error: "Query failed" }, { status: 500 });
  }

  if (!candidates || candidates.length === 0) {
    return NextResponse.json({ checked: 0, sent: 0 });
  }

  // Two flat follow-up queries instead of a deep nested embed — simpler to
  // type correctly and this route only runs once a day, so the extra round
  // trips cost nothing that matters.
  const projectIds = [...new Set(candidates.map((co) => co.project_id))];
  const { data: projects } = await supabaseAdmin
    .from("projects")
    .select("id, client_name, client_email, unique_token, user_id")
    .in("id", projectIds);

  const userIds = [...new Set((projects ?? []).map((p) => p.user_id))];
  const { data: providers } = await supabaseAdmin
    .from("users")
    .select("id, email, company_name, subscription_tier")
    .in("id", userIds);

  const projectById = new Map((projects ?? []).map((p) => [p.id, p]));
  const providerById = new Map((providers ?? []).map((u) => [u.id, u]));

  let sent = 0;

  for (const changeOrder of candidates) {
    const project = projectById.get(changeOrder.project_id);
    const provider = project ? providerById.get(project.user_id) : undefined;

    if (!project?.client_email || !provider || !changeOrder.due_date) {
      continue;
    }

    const tier = isPlanTier(provider.subscription_tier) ? provider.subscription_tier : "free";
    if (!planHasFeature(tier, "automatedReminders")) {
      continue;
    }

    const companyName = provider.company_name || "Your contractor";
    const dueDate = new Date(`${changeOrder.due_date}T00:00:00`);
    const isOverdue = dueDate.getTime() < Date.now();

    try {
      await sendEmail({
        to: project.client_email,
        subject: isOverdue
          ? `Payment overdue: ${changeOrder.description.slice(0, 60)}`
          : `Payment reminder: ${changeOrder.description.slice(0, 60)}`,
        react: NotificationEmail({
          preview: `A payment for ${companyName} is ${isOverdue ? "overdue" : "coming due"}`,
          heading: isOverdue ? "Payment overdue" : "Payment due soon",
          body: `$${Number(changeOrder.cost).toFixed(2)} for "${changeOrder.description}" ${
            isOverdue ? "was due" : "is due"
          } ${dueDate.toLocaleDateString()}.`,
          ctaLabel: "Pay now",
          ctaUrl: `${siteUrl}/p/${project.unique_token}`,
          footer: `Sent by TradeLock on behalf of ${companyName}.`,
        }),
      });

      await supabaseAdmin
        .from("change_orders")
        .update({ last_reminder_sent_at: new Date().toISOString() })
        .eq("id", changeOrder.id);

      sent++;
    } catch (sendError) {
      console.error(`Failed to send reminder for change order ${changeOrder.id}:`, sendError);
    }
  }

  return NextResponse.json({ checked: candidates.length, sent });
}
