import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";

await rm("dist", { recursive: true, force: true });
await mkdir("dist", { recursive: true });
const [html, app] = await Promise.all([readFile("index.html", "utf8"), readFile("main.js", "utf8")]);
await writeFile("dist/index.html", html.replace("<!--app-->", `<script type="module">${app}</script>`));
await cp("styles.css", "dist/styles.css");
