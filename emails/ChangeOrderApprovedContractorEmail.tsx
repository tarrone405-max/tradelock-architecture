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

export default function ChangeOrderApprovedContractorEmail({
  clientName,
  description,
  cost,
  projectUrl,
}: {
  clientName: string;
  description: string;
  cost: string;
  projectUrl: string;
}) {
  return (
    <Html>
      <Head />
      <Preview>{clientName} approved a change order</Preview>
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
            Change order approved
          </Heading>
          <Text style={{ fontSize: "14px", color: "#374151", margin: "0 0 16px" }}>
            <strong>{clientName}</strong> signed and approved a change order.
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
          </Section>
          <Link
            href={projectUrl}
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
            View in TradeLock
          </Link>
          <Text style={{ fontSize: "12px", color: "#9ca3af", marginTop: "24px" }}>
            Sent by TradeLock — this is an automated notification.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}
