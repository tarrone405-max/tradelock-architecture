import {
  Body,
  Container,
  Head,
  Heading,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from "@react-email/components";

export default function ChangeOrderReceiptEmail({
  companyName,
  description,
  cost,
  dueDate,
  portalUrl,
}: {
  companyName: string;
  description: string;
  cost: string;
  dueDate: string | null;
  portalUrl: string;
}) {
  return (
    <Html>
      <Head />
      <Preview>Your change order with {companyName} has been recorded</Preview>
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
          <Heading style={{ fontSize: "18px", color: "#111827", margin: "0 0 8px" }}>
            You approved a change order
          </Heading>
          <Text style={{ fontSize: "14px", color: "#374151", margin: "0 0 16px" }}>
            This confirms your digital signature for the following extra work with{" "}
            <strong>{companyName}</strong>.
          </Text>
          <Section
            style={{
              backgroundColor: "#f9fafb",
              borderRadius: "6px",
              padding: "16px",
              margin: "0 0 20px",
            }}
          >
            <Text style={{ fontSize: "14px", color: "#111827", margin: "0 0 4px" }}>
              {description}
            </Text>
            <Text style={{ fontSize: "18px", fontWeight: "bold", color: "#111827", margin: "0" }}>
              {cost}
            </Text>
            {dueDate && (
              <Text style={{ fontSize: "12px", color: "#6b7280", margin: "4px 0 0" }}>
                Payment due {dueDate}
              </Text>
            )}
          </Section>
          <Link
            href={portalUrl}
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
            View your portal
          </Link>
          <Text style={{ fontSize: "12px", color: "#9ca3af", marginTop: "24px" }}>
            Sent by TradeLock on behalf of {companyName}. Keep this email as your record.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}
