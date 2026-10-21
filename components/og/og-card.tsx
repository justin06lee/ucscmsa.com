import { readFile } from "node:fs/promises";
import { join } from "node:path";

// Share images (next/og, rendered by Satori: flexbox only, every multi-child
// div needs display:flex). Fonts are Latin subsets of the site's Amiri and
// Inter; the logo and wordmark are downscaled copies of public/letters, so the
// whole set stays far under next/og's 500KB limit. See assets/og/.

export const OG_SIZE = { width: 1200, height: 630 };

const PAPER = "#f5efe2";
const INK = "#151312";
const DIM = "#6f655a";
const BURGUNDY = "#6b1f2a";

const dir = join(process.cwd(), "assets/og");

async function dataUrl(file: string) {
  return `data:image/png;base64,${(await readFile(join(dir, file))).toString("base64")}`;
}

// Read once per server instance.
let assets: ReturnType<typeof loadAssets> | null = null;
async function loadAssets() {
  const [amiri, inter, icon, wordmark] = await Promise.all([
    readFile(join(dir, "Amiri-Bold.ttf")),
    readFile(join(dir, "Inter-Medium.ttf")),
    dataUrl("icon.png"),
    dataUrl("wordmark.png"),
  ]);
  return {
    icon,
    wordmark,
    fonts: [
      { name: "Amiri", data: amiri, weight: 700 as const, style: "normal" as const },
      { name: "Inter", data: inter, weight: 500 as const, style: "normal" as const },
    ],
  };
}
export function ogAssets() {
  assets ??= loadAssets();
  return assets;
}

// The wordmark PNG is 1622x192.
const WORDMARK_RATIO = 1622 / 192;

type Assets = Awaited<ReturnType<typeof loadAssets>>;

export function SiteCard({ a }: { a: Assets }) {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background: PAPER,
        color: INK,
        fontFamily: "Inter",
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img alt="" src={a.icon} width={190} height={190} />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img alt="" src={a.wordmark} width={88 * WORDMARK_RATIO} height={88} style={{ marginTop: 26 }} />
      <div style={{ marginTop: 34, fontFamily: "Amiri", fontSize: 46, lineHeight: 1.1 }}>
        Muslim Student Association at UC Santa Cruz
      </div>
      <div style={{ marginTop: 14, fontSize: 26, color: DIM }}>
        Events and prayer times · ucscmsa.com
      </div>
    </div>
  );
}

export function EventCard({
  a,
  title,
  when,
  where,
  cancelled,
}: {
  a: Assets;
  title: string;
  when: string;
  where: string;
  cancelled: boolean;
}) {
  const text = title.length > 90 ? `${title.slice(0, 89).trimEnd()}…` : title;
  const fontSize = text.length <= 28 ? 88 : text.length <= 56 ? 70 : 56;
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: "56px 72px",
        background: PAPER,
        color: INK,
        fontFamily: "Inter",
      }}
    >
      <div style={{ display: "flex", alignItems: "center" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img alt="" src={a.icon} width={84} height={84} />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img alt="" src={a.wordmark} width={46 * WORDMARK_RATIO} height={46} style={{ marginLeft: 22 }} />
      </div>
      <div style={{ display: "flex", flexDirection: "column" }}>
        {cancelled ? (
          <div
            style={{
              display: "flex",
              alignSelf: "flex-start",
              marginBottom: 18,
              padding: "8px 20px",
              borderRadius: 999,
              border: `3px solid ${BURGUNDY}`,
              color: BURGUNDY,
              fontSize: 28,
              letterSpacing: 2,
              textTransform: "uppercase",
            }}
          >
            Cancelled
          </div>
        ) : null}
        <div
          style={{
            fontFamily: "Amiri",
            fontSize,
            lineHeight: 1.12,
            color: cancelled ? DIM : INK,
            textDecoration: cancelled ? "line-through" : "none",
          }}
        >
          {text}
        </div>
        <div style={{ marginTop: 22, fontSize: 34 }}>{when}</div>
        <div style={{ marginTop: 8, fontSize: 30, color: DIM }}>{where}</div>
      </div>
      <div style={{ display: "flex", justifyContent: "flex-end", fontSize: 24, color: DIM }}>
        ucscmsa.com
      </div>
    </div>
  );
}
