// Demos and screenshots only: shows a data snapshot as the site looked at a
// moment, by starting the server's clock there (it keeps running from it).
// Never in production. Build and start with the same moment, since the
// landing is prerendered:
//
//   FAKE_NOW=2026-10-21T14:00:00-07:00 NODE_OPTIONS="--require ./scripts/fake-now.cjs" bun run build
//   FAKE_NOW=2026-10-21T14:00:00-07:00 NODE_OPTIONS="--require ./scripts/fake-now.cjs" bunx next start
const at = Date.parse(process.env.FAKE_NOW ?? "");
if (!Number.isNaN(at)) {
  const RealDate = Date;
  const offset = at - RealDate.now();
  class FakeDate extends RealDate {
    constructor(...args) {
      if (args.length === 0) super(RealDate.now() + offset);
      else super(...args);
    }
    static now() {
      return RealDate.now() + offset;
    }
  }
  globalThis.Date = FakeDate;
}
