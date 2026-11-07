import fs from "node:fs";
import crypto from "node:crypto";
const site = "https://nfse-conecta.arthurgabrielfera.workers.dev";
const extensionRoot = fs.existsSync("../manifest.json") ? ".." : "../nfse-git";
const extensionVersion = JSON.parse(
  fs.readFileSync(extensionRoot + "/manifest.json", "utf8"),
).version;
const versions = JSON.parse(fs.readFileSync("versions.json", "utf8"));
const artifact = (file, version) => ({
  version,
  url: site + "/downloads/" + file,
  sha256: crypto
    .createHash("sha256")
    .update(fs.readFileSync("downloads/" + file))
    .digest("hex"),
});
const pc = versions.windowsAvailable === true
  ? {...artifact("NFSe-Conecta-PC.exe", versions.pc), available: true}
  : {version: versions.pc, available: false};
if (pc.available && pc.sha256 !== versions.windowsApprovedSha256) {
  throw new Error("O executável do Windows não corresponde ao arquivo aprovado para distribuição.");
}
const manifest = {
  pc,
  android: {
    ...artifact("NFSe-Conecta.apk", versions.android),
    versionCode: versions.androidCode,
  },
  extension: artifact("NFSe-Automatico.zip", extensionVersion),
};
fs.writeFileSync("web/updates.json", JSON.stringify(manifest, null, 2) + "\n");
