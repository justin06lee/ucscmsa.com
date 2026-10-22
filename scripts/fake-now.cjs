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
  // A function, not a subclass, so Date() without `new` works too; dates it
  // makes are real Dates.
  function FakeDate(...args) {
    if (!new.target) return new RealDate(RealDate.now() + offset).toString();
    return args.length === 0 ? new RealDate(RealDate.now() + offset) : new RealDate(...args);
  }
  Object.setPrototypeOf(FakeDate, RealDate);
  FakeDate.prototype = RealDate.prototype;
  // Own properties, not inherited ones: Next copies Date's own statics when
  // it wraps it, and lost parse and UTC otherwise.
  FakeDate.now = () => RealDate.now() + offset;
  FakeDate.parse = RealDate.parse;
  FakeDate.UTC = RealDate.UTC;
  globalThis.Date = FakeDate;
}
