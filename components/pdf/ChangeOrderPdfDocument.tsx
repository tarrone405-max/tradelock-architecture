import { Document, Page, Text, View, StyleSheet, Image } from "@react-pdf/renderer";

const STATUS_LABELS: Record<string, string> = {
  pending: "Pending",
  approved: "Approved",
  declined: "Declined",
  paid: "Paid (Card via Stripe)",
  cash: "Paid via Cash",
  check: "Paid via Check",
  financed: "Financed / Lender Approved",
};

const currency = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

const styles = StyleSheet.create({
  page: { padding: 40, paddingBottom: 70, fontSize: 11, fontFamily: "Helvetica", color: "#111827" },
  header: {
    marginBottom: 24,
    borderBottom: 1,
    borderBottomColor: "#e5e7eb",
    paddingBottom: 16,
  },
  companyName: { fontSize: 18, fontFamily: "Helvetica-Bold", marginBottom: 2 },
  docTitle: { fontSize: 11, color: "#6b7280" },
  section: { marginBottom: 18 },
  sectionTitle: {
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    color: "#6b7280",
    marginBottom: 6,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  row: { flexDirection: "row", justifyContent: "space-between", marginBottom: 4 },
  label: { color: "#6b7280" },
  value: { fontFamily: "Helvetica-Bold" },
  description: { lineHeight: 1.4 },
  cost: { fontSize: 22, fontFamily: "Helvetica-Bold", marginTop: 8 },
  meta: { marginTop: 4, fontSize: 9, color: "#6b7280" },
  signatureBox: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 4,
    padding: 10,
    height: 100,
    justifyContent: "center",
    alignItems: "flex-start",
  },
  signatureImage: { maxHeight: 80, maxWidth: 300 },
  termsBox: {
    marginTop: 8,
    padding: 10,
    backgroundColor: "#f9fafb",
    borderRadius: 4,
  },
  termsText: { fontSize: 9, lineHeight: 1.5, color: "#374151" },
  footer: {
    position: "absolute",
    bottom: 30,
    left: 40,
    right: 40,
    fontSize: 8,
    color: "#9ca3af",
    textAlign: "center",
    borderTop: 1,
    borderTopColor: "#e5e7eb",
    paddingTop: 8,
  },
});

export type ChangeOrderPdfProps = {
  companyName: string | null;
  clientName: string;
  propertyAddress: string | null;
  description: string;
  cost: number;
  status: string;
  createdAt: string;
  dueDate: string | null;
  signedAt: string | null;
  signatureData: string | null;
  clientSignatureName: string | null;
  providerSignatureName: string | null;
  providerSignedAt: string | null;
  paymentReference: string | null;
  terms: { version: number; content: string } | null;
};

export default function ChangeOrderPdfDocument({
  companyName,
  clientName,
  propertyAddress,
  description,
  cost,
  status,
  createdAt,
  dueDate,
  signedAt,
  signatureData,
  clientSignatureName,
  providerSignatureName,
  providerSignedAt,
  paymentReference,
  terms,
}: ChangeOrderPdfProps) {
  return (
    <Document title={`Change Order — ${clientName}`}>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.companyName}>{companyName ?? "TradeLock"}</Text>
          <Text style={styles.docTitle}>Change Order Record</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Client</Text>
          <View style={styles.row}>
            <Text style={styles.label}>Name</Text>
            <Text style={styles.value}>{clientName}</Text>
          </View>
          {propertyAddress && (
            <View style={styles.row}>
              <Text style={styles.label}>Property</Text>
              <Text style={styles.value}>{propertyAddress}</Text>
            </View>
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Change Order Details</Text>
          <Text style={styles.description}>{description}</Text>
          <Text style={styles.cost}>{currency.format(cost)}</Text>
          <Text style={[styles.meta, { fontFamily: "Helvetica-Bold", color: "#111827" }]}>
            Status: {STATUS_LABELS[status] ?? status}
          </Text>
          <Text style={styles.meta}>Created {new Date(createdAt).toLocaleString()}</Text>
          {dueDate && (
            <Text style={styles.meta}>
              Payment due {new Date(dueDate + "T00:00:00").toLocaleDateString()}
            </Text>
          )}
          {paymentReference && <Text style={styles.meta}>Reference: {paymentReference}</Text>}
        </View>

        {signatureData && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Client Signature</Text>
            <View style={styles.signatureBox}>
              <Image src={signatureData} style={styles.signatureImage} />
            </View>
            <Text style={[styles.meta, { fontFamily: "Helvetica-Bold", color: "#111827" }]}>
              {clientSignatureName ?? clientName}
            </Text>
            {signedAt && <Text style={styles.meta}>Signed {new Date(signedAt).toLocaleString()}</Text>}
          </View>
        )}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Provider Countersignature</Text>
          {providerSignatureName && providerSignedAt ? (
            <>
              <Text style={[styles.meta, { fontFamily: "Helvetica-Bold", color: "#111827" }]}>
                {providerSignatureName}
              </Text>
              <Text style={styles.meta}>
                Countersigned {new Date(providerSignedAt).toLocaleString()}
              </Text>
            </>
          ) : (
            <Text style={styles.meta}>Not yet countersigned by the provider.</Text>
          )}
        </View>

        {terms && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Terms of Service (v{terms.version}) — Agreed</Text>
            <View style={styles.termsBox}>
              <Text style={styles.termsText}>{terms.content}</Text>
            </View>
          </View>
        )}

        <Text style={styles.footer} fixed>
          Generated by TradeLock on {new Date().toLocaleString()}. This document records the change
          order above and does not replace the original service agreement between the parties.
        </Text>
      </Page>
    </Document>
  );
}
