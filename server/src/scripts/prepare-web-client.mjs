import { copyFile, mkdir, readdir } from "node:fs/promises";
import { resolve } from "node:path";

const swf = process.argv[2]
  ? resolve(process.argv[2])
  : new URL("../../../bin/bymr-local.swf", import.meta.url);
const play = new URL("../../public/play/", import.meta.url);
const runtime = new URL("../../node_modules/@ruffle-rs/ruffle/", import.meta.url);
const publicRuntime = new URL("ruffle/", play);

const source = Bun.file(swf);
if (!(await source.exists())) {
  console.error("Build bin/bymr-local.swf with asconfig.local.json before running web:prepare.");
  process.exit(1);
}
const signature = await source.slice(0, 3).text();
if (!["FWS", "CWS", "ZWS"].includes(signature) || source.size < 8) {
  throw new Error("The supplied game client is not a valid SWF file.");
}

const runtimeFiles = (await readdir(runtime)).filter((name) =>
  /\.(?:js|js\.map|wasm)$/.test(name) || name.startsWith("LICENSE_")
);

await mkdir(publicRuntime, { recursive: true });
await Promise.all(runtimeFiles.map((name) =>
  copyFile(new URL(name, runtime), new URL(name, publicRuntime))
));
await copyFile(swf, new URL("game.swf", play));
console.log("Browser client prepared at /play/.");
