import { FaGithub, FaHeart, FaLinkedin, FaTwitter } from "react-icons/fa";

const GITHUB_REPO = "https://github.com/FileOnchain/fileonchain-web";
const AUTHOR_LINKS = [
  { href: "https://github.com/marc-aurele-besner", label: "GitHub", Icon: FaGithub },
  {
    href: "https://www.linkedin.com/in/marc-aurele-besner/",
    label: "LinkedIn",
    Icon: FaLinkedin,
  },
  { href: "https://x.com/marcaureleb", label: "Twitter", Icon: FaTwitter },
];

/**
 * Footer — bottom of the layout chrome. Lives in `layout.tsx` (not page) so
 * it persists across routes. Reserves flow space (no `fixed bottom-0`) so it
 * never overlaps content.
 */
const Footer = () => (
  <footer className="mt-16 border-t border-border bg-surface">
    <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-center gap-x-6 gap-y-3 px-4 py-5 text-sm text-muted md:px-6">
      <a
        href={GITHUB_REPO}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-2 text-foreground hover:text-primary transition-colors"
      >
        <FaGithub size={18} />
        <span>GitHub Repo</span>
      </a>
      <p className="inline-flex items-center gap-1.5">
        Made with <FaHeart className="text-danger" /> by Marc-Aurèle
      </p>
      <div className="inline-flex items-center gap-3">
        {AUTHOR_LINKS.map(({ href, label, Icon }) => (
          <a
            key={label}
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={label}
            className="text-muted hover:text-primary transition-colors"
          >
            <Icon size={18} />
          </a>
        ))}
      </div>
    </div>
  </footer>
);

export default Footer;