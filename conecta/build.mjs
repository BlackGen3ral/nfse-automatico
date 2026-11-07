import fs from "node:fs";
const files = {};
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
  for (const name of fs.readdirSync("downloads"))
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
