import { describe, expect, it } from "vitest";
import { CONTACT_LIMITS, formatContactEmail, validateContactInput } from "@/lib/contact";

const valid = {
  name: "Ada Lovelace",
  email: "ada@example.com",
  company: "",
  topic: "cloud",
  message: "I would like to know more about Cloud pricing.",
};

describe("validateContactInput", () => {
  it("accepts a complete submission and trims fields", () => {
    const result = validateContactInput({ ...valid, name: "  Ada Lovelace  " });
    expect(result).toEqual({ ok: true, value: { ...valid, name: "Ada Lovelace" } });
  });

  it("defaults a missing topic to general", () => {
    const result = validateContactInput({ ...valid, topic: undefined });
    expect(result.ok && result.value.topic).toBe("general");
  });

  it("reports every invalid field at once", () => {
    const result = validateContactInput({ email: "not-an-email", topic: "spam", message: "hi" });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(Object.keys(result.errors).sort()).toEqual(["email", "message", "name", "topic"]);
  });

  it("rejects non-object bodies", () => {
    expect(validateContactInput(null).ok).toBe(false);
    expect(validateContactInput("hello").ok).toBe(false);
  });

  it("enforces the message length bounds", () => {
    const tooLong = validateContactInput({
      ...valid,
      message: "x".repeat(CONTACT_LIMITS.messageMax + 1),
    });
    expect(tooLong.ok).toBe(false);
  });

  it("collapses newlines in single-line fields so they cannot inject headers", () => {
    const result = validateContactInput({ ...valid, name: "Ada\r\nBcc: victim@example.com" });
    expect(result.ok && result.value.name).toBe("Ada Bcc: victim@example.com");
  });

  it("ignores non-string field values", () => {
    const result = validateContactInput({ ...valid, name: { $ne: "" } });
    expect(result.ok).toBe(false);
  });
});

describe("formatContactEmail", () => {
  it("builds a labeled subject and plain-text body", () => {
    const result = validateContactInput(valid);
    if (!result.ok) throw new Error("fixture should be valid");
    const { subject, text } = formatContactEmail(result.value);
    expect(subject).toBe("[Contact] FileOnChain Cloud (pricing, accounts, API): Ada Lovelace");
    expect(text).toContain("Email: ada@example.com");
    expect(text).toContain("Company: (not given)");
    expect(text.endsWith(valid.message)).toBe(true);
  });
});
