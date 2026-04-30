import { promises as fs } from "node:fs";
import path from "node:path";
import Link from "next/link";

export const dynamic = "force-dynamic";

const ASCII_COUNT = 10;

export default async function NotFound() {
  const n = 1 + Math.floor(Math.random() * ASCII_COUNT);
  const ascii = await fs.readFile(
    path.join(process.cwd(), "public/ascii", `ascii${n}.txt`),
    "utf8",
  );

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col items-center px-6 py-10">
      <div className="flex flex-1 flex-col items-center justify-center gap-8">
        <pre className="whitespace-pre overflow-x-auto text-xs leading-tight text-ink/70 font-mono">
          {ascii}
        </pre>
        <div className="flex flex-col items-center gap-2 text-center">
          <h1 className="text-3xl">Page not found</h1>
          <p className="text-sm text-dim">The page you&rsquo;re looking for isn&rsquo;t here.</p>
        </div>
        <Link
          href="/"
          className="inline-flex items-center rounded-full border border-ink px-7 py-3 font-medium transition-colors hover:bg-ink hover:text-paper"
        >
          Back home
        </Link>
      </div>
      <p className="text-[11px] text-dim/70">
        site by{" "}
        <a
          href="https://justin06lee.dev"
          target="_blank"
          rel="noopener noreferrer"
          className="underline-offset-2 transition-colors hover:text-ink hover:underline"
        >
          justin06lee.dev
        </a>
      </p>
    </main>
  );
}
