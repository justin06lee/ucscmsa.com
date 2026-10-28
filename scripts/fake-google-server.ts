// A stand-in Google (token endpoint and Calendar API) over HTTP, for the
// browser test of the MSA calendar switch (e2e/msa-calendar.spec.ts).
// Writes a service account key file the app can use as GOOGLE_SA_JSON.
//   bun scripts/fake-google-server.ts 3299 /tmp/fake-sa.json
// GET /_live lists the events on the fake calendar.
import http from "node:http";
import { writeFileSync } from "node:fs";
import { fakeGoogle } from "../test/fake-google";

const port = Number(process.argv[2] ?? 3299);
const keyFile = process.argv[3] ?? "/tmp/fake-sa.json";
const base = `http://localhost:${port}`;
const g = fakeGoogle(base);
writeFileSync(
  keyFile,
  JSON.stringify({
    type: "service_account",
    client_email: g.config.clientEmail,
    private_key: g.config.privateKey,
    token_uri: g.config.tokenUrl,
  }),
);

http
  .createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c as Buffer);
    if (req.url === "/_live") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify(g.live()));
      return;
    }
    const body = Buffer.concat(chunks).toString();
    const reply = await g.fetch(`${base}${req.url}`, {
      method: req.method,
      headers: { Authorization: String(req.headers.authorization ?? "") },
      body: body || undefined,
    });
    res.writeHead(reply.status, { "content-type": "application/json" });
    res.end(await reply.text());
  })
  .listen(port, () => console.log(`fake Google on ${base}, calendar ${g.config.calendarId}`));
