/**
 * Contact form vocabulary shared by the client form
 * (`components/contact/ContactForm.tsx`) and the server route
 * (`app/api/contact/route.ts`). Pure and isomorphic: the server re-runs
 * the same validation the browser ran, so the two can never disagree.
 */

export const CONTACT_TOPICS = [
  { value: "general", label: "General question" },
  { value: "cloud", label: "FileOnChain Cloud (pricing, accounts, API)" },
  { value: "integration", label: "Protocol, SDK, or integration" },
  { value: "partnership", label: "Partnership or press" },
  { value: "other", label: "Something else" },
] as const;

export type ContactTopic = (typeof CONTACT_TOPICS)[number]["value"];

export const CONTACT_LIMITS = {
  name: 120,
  email: 254,
  company: 120,
  messageMin: 10,
  messageMax: 5000,
} as const;

export interface ContactInput {
  name: string;
  email: string;
  company: string;
  topic: ContactTopic;
  message: string;
}

export type ContactFieldErrors = Partial<Record<keyof ContactInput, string>>;

export type ContactValidation =
  | { ok: true; value: ContactInput }
  | { ok: false; errors: ContactFieldErrors };

/** Deliberately loose: one `@`, a dot in the domain, no whitespace. The
 *  real check is whether a reply reaches the address. */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const TOPIC_VALUES = new Set<string>(CONTACT_TOPICS.map((t) => t.value));

const str = (value: unknown): string => (typeof value === "string" ? value.trim() : "");

/** Strip CR/LF so a single-line field can never inject extra email
 *  headers or break the subject line. */
const singleLine = (value: string): string => value.replace(/[\r\n]+/g, " ");

export const validateContactInput = (raw: unknown): ContactValidation => {
  const body = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const name = singleLine(str(body.name));
  const email = singleLine(str(body.email));
  const company = singleLine(str(body.company));
  const topic = str(body.topic) || "general";
  const message = str(body.message);

  const errors: ContactFieldErrors = {};
  if (!name) errors.name = "Please tell us your name.";
  else if (name.length > CONTACT_LIMITS.name)
    errors.name = `Keep it under ${CONTACT_LIMITS.name} characters.`;

  if (!email) errors.email = "We need an email address to reply to.";
  else if (email.length > CONTACT_LIMITS.email || !EMAIL_RE.test(email))
    errors.email = "That email address does not look valid.";

  if (company.length > CONTACT_LIMITS.company)
    errors.company = `Keep it under ${CONTACT_LIMITS.company} characters.`;

  if (!TOPIC_VALUES.has(topic)) errors.topic = "Pick one of the listed topics.";

  if (message.length < CONTACT_LIMITS.messageMin)
    errors.message = `Please write at least ${CONTACT_LIMITS.messageMin} characters.`;
  else if (message.length > CONTACT_LIMITS.messageMax)
    errors.message = `Keep it under ${CONTACT_LIMITS.messageMax} characters.`;

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, value: { name, email, company, topic: topic as ContactTopic, message } };
};

export const contactTopicLabel = (topic: ContactTopic): string =>
  CONTACT_TOPICS.find((t) => t.value === topic)?.label ?? topic;

/** Plain-text email for the team inbox. Text only, so submitted content
 *  is never rendered as HTML by the mail client. */
export const formatContactEmail = (input: ContactInput): { subject: string; text: string } => ({
  subject: `[Contact] ${contactTopicLabel(input.topic)}: ${input.name}`.slice(0, 200),
  text: [
    `Name: ${input.name}`,
    `Email: ${input.email}`,
    `Company: ${input.company || "(not given)"}`,
    `Topic: ${contactTopicLabel(input.topic)}`,
    "",
    input.message,
  ].join("\n"),
});
