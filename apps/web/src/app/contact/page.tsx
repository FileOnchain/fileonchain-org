import type { Metadata } from "next";
import Link from "next/link";
import { PageShell } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/Card";
import ContactForm from "@/components/contact/ContactForm";
import { pageMetadata } from "@/lib/seo";
import { siteConfig } from "@/lib/site";

export const metadata: Metadata = pageMetadata({
  title: "Contact",
  description:
    "Get in touch with the FileOnChain team about FileOnChain Cloud, the Evidence Protocol, the reference SDKs, or partnerships.",
  path: "/contact",
});

const OTHER_CHANNELS = [
  {
    title: "Bugs and feature requests",
    body: "Open an issue on GitHub so the discussion stays public and searchable.",
    href: `${siteConfig.repo}/issues`,
    label: "GitHub issues",
    external: true,
  },
  {
    title: "Integrating the SDK",
    body: "Start with the reference SDK documentation and the protocol explainer.",
    href: "/docs",
    label: "SDK documentation",
    external: false,
  },
  {
    title: "Quick answers",
    body: "Common questions about evidence, storage, and verification.",
    href: "/#faq",
    label: "Read the FAQ",
    external: false,
  },
] as const;

const linkClass = "text-sm text-primary underline underline-offset-2";

/** /contact: the public contact form (sent through Resend by
 *  `POST /api/contact`) plus pointers to the public channels. */
const ContactPage = () => (
  <PageShell size="wide" padding="lg" atmosphere>
    <PageHeader
      className="mb-8"
      index="13"
      kicker="Contact"
      title="Talk to the team"
      lede="Questions about FileOnChain Cloud, the Evidence Protocol, an integration, or a partnership? Send a message and we will reply by email."
    />

    <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
      <Card className="p-6">
        <ContactForm />
      </Card>

      <aside className="flex flex-col gap-4" aria-label="Other ways to reach us">
        {OTHER_CHANNELS.map((channel) => (
          <Card key={channel.title} className="p-5">
            <h2 className="font-medium">{channel.title}</h2>
            <p className="mt-1 text-sm text-muted">{channel.body}</p>
            <p className="mt-3">
              {channel.external ? (
                <a href={channel.href} className={linkClass} target="_blank" rel="noopener noreferrer">
                  {channel.label}
                </a>
              ) : (
                <Link href={channel.href} className={linkClass}>
                  {channel.label}
                </Link>
              )}
            </p>
          </Card>
        ))}
      </aside>
    </div>
  </PageShell>
);

export default ContactPage;
