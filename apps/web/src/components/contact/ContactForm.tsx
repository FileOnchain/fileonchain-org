"use client";

import * as React from "react";
import { FiCheckCircle, FiSend } from "react-icons/fi";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { trackEvent } from "@/lib/analytics";
import { cn } from "@/lib/cn";
import {
  CONTACT_LIMITS,
  CONTACT_TOPICS,
  validateContactInput,
  type ContactFieldErrors,
  type ContactTopic,
} from "@/lib/contact";
import { siteConfig } from "@/lib/site";

type Status =
  | { kind: "idle" }
  | { kind: "sending" }
  | { kind: "sent" }
  | { kind: "error"; message: string; unavailable?: boolean };

const EMPTY = { name: "", email: "", company: "", topic: "general" as ContactTopic, message: "" };

/**
 * ContactForm: client half of `/contact`. Validates with the shared
 * `lib/contact.ts` rules before posting to `/api/contact`, which re-runs
 * them and forwards the message through Resend.
 */
export const ContactForm = () => {
  const [values, setValues] = React.useState(EMPTY);
  const [website, setWebsite] = React.useState("");
  const [errors, setErrors] = React.useState<ContactFieldErrors>({});
  const [status, setStatus] = React.useState<Status>({ kind: "idle" });

  const update =
    <K extends keyof typeof EMPTY>(field: K) =>
    (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
      setValues((prev) => ({ ...prev, [field]: event.target.value }));
      if (errors[field]) setErrors((prev) => ({ ...prev, [field]: undefined }));
    };

  const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const result = validateContactInput(values);
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setStatus({ kind: "sending" });
    try {
      const response = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...result.value, website }),
      });
      const payload = (await response.json().catch(() => null)) as {
        error?: string;
        code?: string;
        fields?: ContactFieldErrors;
      } | null;
      if (!response.ok) {
        if (payload?.fields) setErrors(payload.fields);
        setStatus({
          kind: "error",
          message: payload?.error ?? "Something went wrong. Please try again.",
          unavailable: payload?.code === "not_implemented",
        });
        trackEvent("contact_submit", { topic: values.topic, status: "error" });
        return;
      }
      setStatus({ kind: "sent" });
      setValues(EMPTY);
      trackEvent("contact_submit", { topic: result.value.topic, status: "success" });
    } catch {
      setStatus({ kind: "error", message: "Network error. Please check your connection and retry." });
      trackEvent("contact_submit", { topic: values.topic, status: "error" });
    }
  };

  if (status.kind === "sent") {
    return (
      <div role="status" className="flex flex-col items-start gap-3 py-6">
        <FiCheckCircle className="h-8 w-8 text-success" aria-hidden />
        <h2 className="text-lg font-semibold">Message sent</h2>
        <p className="text-sm text-muted">
          Thanks for reaching out. We read every message and reply by email, usually within a few
          working days.
        </p>
        <Button variant="secondary" size="sm" onClick={() => setStatus({ kind: "idle" })}>
          Send another message
        </Button>
      </div>
    );
  }

  const sending = status.kind === "sending";

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
      <div className="grid gap-5 sm:grid-cols-2">
        <Input
          label="Name"
          name="name"
          autoComplete="name"
          required
          maxLength={CONTACT_LIMITS.name}
          value={values.name}
          onChange={update("name")}
          error={errors.name}
          fullWidth
        />
        <Input
          label="Email"
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          required
          maxLength={CONTACT_LIMITS.email}
          value={values.email}
          onChange={update("email")}
          error={errors.email}
          fullWidth
        />
      </div>
      <div className="grid gap-5 sm:grid-cols-2">
        <Input
          label="Company (optional)"
          name="company"
          autoComplete="organization"
          maxLength={CONTACT_LIMITS.company}
          value={values.company}
          onChange={update("company")}
          error={errors.company}
          fullWidth
        />
        <Select
          label="Topic"
          name="topic"
          value={values.topic}
          onChange={update("topic")}
          fullWidth
        >
          {CONTACT_TOPICS.map((topic) => (
            <option key={topic.value} value={topic.value}>
              {topic.label}
            </option>
          ))}
        </Select>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="contact-message" className="text-sm font-medium text-foreground">
          Message
        </label>
        <textarea
          id="contact-message"
          name="message"
          required
          rows={7}
          maxLength={CONTACT_LIMITS.messageMax}
          value={values.message}
          onChange={update("message")}
          aria-invalid={errors.message ? "true" : undefined}
          aria-describedby="contact-message-desc"
          className={cn(
            "w-full resize-y rounded-md border bg-surface p-3 text-sm text-foreground placeholder:text-muted",
            "transition-colors duration-base ease-out-soft",
            "focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/30",
            errors.message ? "border-danger" : "border-border",
          )}
        />
        <p
          id="contact-message-desc"
          className={cn("text-xs", errors.message ? "text-danger" : "text-muted")}
        >
          {errors.message ??
            `${values.message.length.toLocaleString()} / ${CONTACT_LIMITS.messageMax.toLocaleString()} characters`}
        </p>
      </div>

      {/* Honeypot: hidden from people and assistive tech; bots fill it in. */}
      <div aria-hidden className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label htmlFor="contact-website">Website</label>
        <input
          id="contact-website"
          name="website"
          tabIndex={-1}
          autoComplete="off"
          value={website}
          onChange={(event) => setWebsite(event.target.value)}
        />
      </div>

      {status.kind === "error" && (
        <div role="alert" className="rounded-md border border-danger/40 bg-danger/10 p-3 text-sm">
          <p className="text-danger">{status.message}</p>
          {status.unavailable && (
            <p className="mt-1 text-muted">
              You can still reach us by opening an issue on{" "}
              <a
                href={`${siteConfig.repo}/issues/new`}
                className="text-primary underline underline-offset-2"
                target="_blank"
                rel="noopener noreferrer"
              >
                GitHub
              </a>
              .
            </p>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-4">
        <Button type="submit" isLoading={sending} disabled={sending} leftIcon={<FiSend aria-hidden />}>
          {sending ? "Sending" : "Send message"}
        </Button>
        <p className="text-xs text-muted">
          We only use your details to reply. Messages are emailed to the team, never anchored.
        </p>
      </div>
    </form>
  );
};

export default ContactForm;
