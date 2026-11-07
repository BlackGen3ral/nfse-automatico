import fs from "node:fs";
import { createHash } from "node:crypto";
const files = {};
const updates = JSON.parse(fs.readFileSync("web/updates.json", "utf8"));
const versions = JSON.parse(fs.readFileSync("versions.json", "utf8"));
const downloads = ["NFSe-Conecta.apk", "NFSe-Automatico.zip"];
if (versions.windowsAvailable === true && updates.pc.available === true) {
  const bytes = fs.readFileSync("downloads/NFSe-Conecta-PC.exe");
  const digest = createHash("sha256").update(bytes).digest("hex");
  if (digest !== versions.windowsApprovedSha256 || digest !== updates.pc.sha256) {
    throw new Error("Windows: o arquivo disponível é diferente do executável validado.");
  }
  downloads.push("NFSe-Conecta-PC.exe");
}
for (const name of fs.readdirSync("web")) {
  const type = name.endsWith(".html")
    ? "text/html; charset=utf-8"
    : name.endsWith(".css")
      ? "text/css; charset=utf-8"
      : name.endsWith(".js")
        ? "text/javascript; charset=utf-8"
        : name.endsWith(".svg")
          ? "image/svg+xml"
          : name.endsWith(".json")
            ? "application/json"
            : "application/octet-stream";
  files["/" + name] = {
    type,
    data: fs.readFileSync("web/" + name, "utf8").replace(/^\uFEFF/, ""),
  };
}
files["/app"] = files["/app.html"];
if (fs.existsSync("downloads"))
  for (const name of downloads.filter(name => fs.existsSync("downloads/" + name)))
    files["/downloads/" + name] = {
      type: name.endsWith(".apk")
        ? "application/vnd.android.package-archive"
        : "application/octet-stream",
      base64: true,
      data: fs.readFileSync("downloads/" + name).toString("base64"),
    };
fs.writeFileSync(
  "server/assets.js",
  "export const assets = " + JSON.stringify(files) + ";\n",
);
console.log("Assets preparados:", Object.keys(files).length);
