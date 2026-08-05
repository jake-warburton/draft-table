import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { minify } from "html-minifier-terser";

const minifyOptions = {
  collapseWhitespace: true,
  minifyCSS: true,
  minifyJS: true,
  removeComments: true
};

const minifyStylesheet = async (stylesheet) => {
  const document = await minify(`<style>${stylesheet}</style>`, minifyOptions);
  return document.slice("<style>".length, -"</style>".length);
};

await rm("dist", { recursive: true, force: true });
await mkdir("dist", { recursive: true });

const [html, app, stylesheet] = await Promise.all([
  readFile("index.html", "utf8"),
  readFile("main.js", "utf8"),
  readFile("styles.css", "utf8")
]);
const minifiedApp = await minify(`<script type="module">${app}</script>`, {
  ...minifyOptions,
  minifyJS: { mangle: { toplevel: true }, module: true }
});
const emittedHtml = await minify(html.replace("<!--app-->", minifiedApp), minifyOptions);
const emittedStylesheet = await minifyStylesheet(stylesheet);

await Promise.all([
  writeFile("dist/index.html", emittedHtml),
  writeFile("dist/styles.css", emittedStylesheet)
]);
