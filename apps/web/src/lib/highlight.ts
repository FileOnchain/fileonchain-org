import { createHighlighterCore, type HighlighterCore } from "shiki/core";
import { createJavaScriptRegexEngine } from "shiki/engine/javascript";
import { bundledLanguages } from "shiki/langs";
import { bundledThemes } from "shiki/themes";

/** Languages the docs/marketing snippets actually use — keeps the server
 * bundle to three grammars instead of Shiki's full set. */
export type CodeLanguage = "ts" | "json" | "sh";

let highlighterPromise: Promise<HighlighterCore> | null = null;

/* Lazy singleton — grammars and themes load once per server process. The
 * pure-JS regex engine avoids shipping/loading the oniguruma wasm binary
 * through the Next server build. */
const getHighlighter = (): Promise<HighlighterCore> => {
  highlighterPromise ??= createHighlighterCore({
    themes: [bundledThemes["github-light"](), bundledThemes["github-dark"]()],
    langs: [
      bundledLanguages.typescript(),
      bundledLanguages.json(),
      bundledLanguages.shellscript(),
    ],
    engine: createJavaScriptRegexEngine(),
  });
  return highlighterPromise;
};

/**
 * Highlight a static code snippet to HTML on the server. Both themes are
 * emitted as `--shiki-light` / `--shiki-dark` CSS variables on each token
 * (`defaultColor: false`); globals.css picks one based on the root `.dark`
 * class, so the output is theme-agnostic HTML with no client JS.
 */
export const highlightCode = async (
  code: string,
  language: CodeLanguage,
): Promise<string> => {
  const highlighter = await getHighlighter();
  return highlighter.codeToHtml(code, {
    lang: language,
    themes: { light: "github-light", dark: "github-dark" },
    defaultColor: false,
    transformers: [
      {
        // Re-apply CodeBlock's original pre/code styling onto Shiki's output.
        pre(node) {
          this.addClassToHast(node, "overflow-x-auto p-4 text-xs leading-relaxed");
        },
        code(node) {
          this.addClassToHast(node, "font-mono");
        },
      },
    ],
  });
};
