import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getUserPlan } from "@/lib/planAccess";

export const runtime = "nodejs";

function csvEscape(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

// CSV export of a provider's own change orders — a Pro+ feature
// (lib/plans.ts's dataExports flag), re-checked here server-side rather
// than trusting the "Export CSV" button being hidden for Free providers on
// the reports page.
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const plan = await getUserPlan(user.id);
  if (!plan.features.dataExports) {
    return NextResponse.json(
      { error: "Data export requires the Pro plan or higher." },
      { status: 403 }
    );
  }

  // RLS already scopes this to change orders on projects this provider owns.
  const { data: changeOrders, error } = await supabase
    .from("change_orders")
    .select("id, description, cost, status, created_at, due_date, paid_at, refunded_amount")
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const header = [
    "ID",
    "Description",
    "Cost",
    "Status",
    "Created At",
    "Due Date",
    "Paid At",
    "Refunded Amount",
  ];

  const rows = (changeOrders ?? []).map((co) => [
    co.id,
    co.description,
    Number(co.cost).toFixed(2),
    co.status,
    co.created_at,
    co.due_date ?? "",
    co.paid_at ?? "",
    co.refunded_amount != null ? (co.refunded_amount / 100).toFixed(2) : "",
  ]);

  const csv = [header, ...rows]
    .map((row) => row.map((cell) => csvEscape(String(cell))).join(","))
    .join("\n");

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="tradelock-change-orders-${new Date()
        .toISOString()
        .slice(0, 10)}.csv"`,
    },
  });
}
