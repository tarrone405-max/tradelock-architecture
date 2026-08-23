import { NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { createClient } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { asOrgClient } from "@/src/core/organizations/database.types";
import ChangeOrderPdfDocument from "@/components/pdf/ChangeOrderPdfDocument";

export const runtime = "nodejs";

// Two distinct callers hit this route: the authenticated provider from the
// dashboard, and an unauthenticated homeowner from their client portal —
// authorized via ?token=<project's unique_token>, same dual-path pattern
// used everywhere else a project can be reached from the portal side.
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { searchParams } = new URL(request.url);
  const token = searchParams.get("token");

  const supabaseAdmin = getSupabaseAdmin();

  const { data: changeOrder } = await supabaseAdmin
    .from("change_orders")
    .select(
      "id, description, cost, status, created_at, due_date, signed_at, signature_data, client_signature_name, provider_signature_name, provider_signed_at, payment_reference, terms_version_id, project_id"
    )
    .eq("id", id)
    .maybeSingle();

  if (!changeOrder) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { data: project } = await supabaseAdmin
    .from("projects")
    .select(
      "id, client_name, property_address, unique_token, portal_token_revoked_at, user_id, users(company_name)"
    )
    .eq("id", changeOrder.project_id)
    .maybeSingle();

  if (!project) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // A revoked/rotated-away portal token must stop working here too — the
  // authenticated-provider fallback path just below is unaffected, since
  // revocation is about killing client access, not the provider's own.
  let authorized =
    token !== null && token === project.unique_token && !project.portal_token_revoked_at;

  if (!authorized) {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user) {
      // RLS-scoped lookup, not the admin client used above — a row coming
      // back means the signed-in user is an active member of this project's
      // organization, which is the actual authorization check (mirrors the
      // pattern used in app/(dashboard)/dashboard/actions.ts). Replaces a
      // plain user.id === project.user_id check, which only ever authorized
      // the original creating user, not other members of the same org.
      const { data: membershipCheck } = await asOrgClient(supabase)
        .from("projects")
        .select("id")
        .eq("id", project.id)
        .maybeSingle();
      authorized = membershipCheck !== null;
    }
  }

  if (!authorized) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  if (changeOrder.status === "pending") {
    return NextResponse.json(
      { error: "This change order hasn't been resolved yet." },
      { status: 400 }
    );
  }

  let terms: { version: number; content: string } | null = null;
  if (changeOrder.terms_version_id) {
    const { data: termsRow } = await supabaseAdmin
      .from("terms_of_service")
      .select("version, content")
      .eq("id", changeOrder.terms_version_id)
      .maybeSingle();
    terms = termsRow;
  }

  // Called directly as a function (not via createElement) so its return
  // type is the concrete <Document> element renderToBuffer expects — a
  // component wrapper's element type isn't structurally assignable to that.
  const buffer = await renderToBuffer(
    ChangeOrderPdfDocument({
      companyName: project.users?.company_name ?? null,
      clientName: project.client_name,
      propertyAddress: project.property_address,
      description: changeOrder.description,
      cost: Number(changeOrder.cost),
      status: changeOrder.status,
      createdAt: changeOrder.created_at,
      dueDate: changeOrder.due_date,
      signedAt: changeOrder.signed_at,
      signatureData: changeOrder.signature_data,
      clientSignatureName: changeOrder.client_signature_name,
      providerSignatureName: changeOrder.provider_signature_name,
      providerSignedAt: changeOrder.provider_signed_at,
      paymentReference: changeOrder.payment_reference,
      terms,
    })
  );

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="change-order-${id}.pdf"`,
    },
  });
}
