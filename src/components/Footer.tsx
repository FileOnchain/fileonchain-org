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

const Footer = () => (
  <footer className="flex justify-center items-center bg-gray-900 text-white py-4 w-full fixed bottom-0">
    <a
      href={GITHUB_REPO}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-2 mr-8"
    >
      <FaGithub size={24} />
      <span>GitHub Repo</span>
    </a>
    <p className="flex items-center gap-2">
      Made with <FaHeart className="text-red-500" /> by Marc-Aurèle
    </p>
    {AUTHOR_LINKS.map(({ href, label, Icon }, index) => (
      <a
        key={label}
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={label}
        className={index === 0 ? "ml-8" : "ml-4"}
      >
        <Icon className="text-white hover:text-gray-400" size={24} />
      </a>
    ))}
  </footer>
);

export default Footer;
