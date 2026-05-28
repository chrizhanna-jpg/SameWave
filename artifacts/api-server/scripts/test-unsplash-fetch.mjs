import crypto from "node:crypto";

const ids = [
  "1559056199-641a0ac8b55e",
  "1495474472287-4d71bcdd2085",
  "1509042239860-f550ce710b93",
];

for (const id of ids) {
  const url = `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=400&q=80`;
  const res = await fetch(url, {
    headers: { "User-Agent": "SameWave/1.0 (stock seed)" },
    redirect: "follow",
  });
  const buf = Buffer.from(await res.arrayBuffer());
  const b64 = buf.toString("base64");
  const prefix = crypto.createHash("md5").update(b64.slice(0, 4096)).digest("hex");
  const full = crypto.createHash("md5").update(b64).digest("hex");
  console.log(id, res.status, buf.length, "prefix", prefix, "full", full);
}
