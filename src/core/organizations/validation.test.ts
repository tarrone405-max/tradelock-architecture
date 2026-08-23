import { describe, expect, it } from "vitest";
import { isBusinessType, slugify, validateCreateOrganizationInput } from "./validation";

describe("isBusinessType", () => {
  it("accepts a known business type", () => {
    expect(isBusinessType("contractor")).toBe(true);
  });

  it("rejects an unknown string", () => {
    expect(isBusinessType("spaceship-repair")).toBe(false);
  });

  it("rejects null/undefined", () => {
    expect(isBusinessType(null)).toBe(false);
    expect(isBusinessType(undefined)).toBe(false);
  });
});

describe("validateCreateOrganizationInput", () => {
  it("accepts a valid input and trims the name", () => {
    const result = validateCreateOrganizationInput({
      name: "  Acme Contracting  ",
      businessType: "contractor",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.name).toBe("Acme Contracting");
      expect(result.value.businessType).toBe("contractor");
    }
  });

  it("rejects an empty name", () => {
    const result = validateCreateOrganizationInput({ name: "   ", businessType: "contractor" });
    expect(result.ok).toBe(false);
  });

  it("rejects a name over the max length", () => {
    const result = validateCreateOrganizationInput({
      name: "a".repeat(121),
      businessType: "contractor",
    });
    expect(result.ok).toBe(false);
  });

  it("rejects an invalid business type", () => {
    const result = validateCreateOrganizationInput({
      name: "Acme",
      businessType: "not-a-real-type",
    });
    expect(result.ok).toBe(false);
  });

  it("passes through optional country/timezone, trimmed, or undefined when blank", () => {
    const withValues = validateCreateOrganizationInput({
      name: "Acme",
      businessType: "contractor",
      country: " US ",
      timezone: " America/New_York ",
    });
    expect(withValues.ok).toBe(true);
    if (withValues.ok) {
      expect(withValues.value.country).toBe("US");
      expect(withValues.value.timezone).toBe("America/New_York");
    }

    const withoutValues = validateCreateOrganizationInput({
      name: "Acme",
      businessType: "contractor",
      country: "   ",
    });
    expect(withoutValues.ok).toBe(true);
    if (withoutValues.ok) {
      expect(withoutValues.value.country).toBeUndefined();
    }
  });
});

describe("slugify", () => {
  it("lowercases and hyphenates a normal name", () => {
    expect(slugify("Acme Contracting Co.")).toBe("acme-contracting-co");
  });

  it("strips leading/trailing punctuation-derived hyphens", () => {
    expect(slugify("--Weird!! Name--")).toBe("weird-name");
  });

  it("falls back to 'organization' when nothing alphanumeric remains", () => {
    expect(slugify("!!!")).toBe("organization");
  });

  it("truncates to the max slug length", () => {
    const longName = "a".repeat(100);
    expect(slugify(longName).length).toBeLessThanOrEqual(60);
  });

  it("appends the attempt number on retry, but not on the first try", () => {
    expect(slugify("Acme", 0)).toBe("acme");
    expect(slugify("Acme", 1)).toBe("acme-1");
    expect(slugify("Acme", 2)).toBe("acme-2");
  });
});
