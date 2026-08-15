import { Body, Container, Head, Heading, Html, Link, Preview, Section, Text } from "@react-email/components";

// Generic template for the smaller, one-off notification emails (new
// message, payment received/failed, refund issued, dispute opened, review
// received) — these are all structurally identical (heading, a short body,
// an optional link back into the app), so one parameterized template
// replaces what would otherwise be five or six near-duplicate files.
// ChangeOrderApprovedContractorEmail/ChangeOrderReceiptEmail stay as their
// own components — they're materially different (itemized change-order
// details in a card), not just a heading + paragraph.
export default function NotificationEmail({
  preview,
  heading,
  body,
  ctaLabel,
  ctaUrl,
  footer,
}: {
  preview: string;
  heading: string;
  body: string;
  ctaLabel?: string;
  ctaUrl?: string;
  footer: string;
}) {
  return (
    <Html>
      <Head />
      <Preview>{preview}</Preview>
      <Body style={{ backgroundColor: "#f9fafb", fontFamily: "Arial, Helvetica, sans-serif" }}>
        <Container
          style={{
            backgroundColor: "#ffffff",
            margin: "40px auto",
            padding: "32px",
            maxWidth: "480px",
            borderRadius: "8px",
            border: "1px solid #e5e7eb",
          }}
        >
          <Heading style={{ fontSize: "18px", color: "#111827", margin: "0 0 8px" }}>{heading}</Heading>
          <Section style={{ margin: "0 0 20px" }}>
            <Text style={{ fontSize: "14px", color: "#374151", margin: "0", whiteSpace: "pre-line" }}>
              {body}
            </Text>
          </Section>
          {ctaLabel && ctaUrl && (
            <Link
              href={ctaUrl}
              style={{
                display: "inline-block",
                backgroundColor: "#111827",
                color: "#ffffff",
                fontSize: "14px",
                fontWeight: "bold",
                padding: "10px 20px",
                borderRadius: "6px",
                textDecoration: "none",
              }}
            >
              {ctaLabel}
            </Link>
          )}
          <Text style={{ fontSize: "12px", color: "#9ca3af", marginTop: "24px" }}>{footer}</Text>
        </Container>
      </Body>
    </Html>
  );
}
