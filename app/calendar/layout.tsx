import { SiteHeader } from "@/components/site-header";

export default function CalendarLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <SiteHeader />
      {children}
    </>
  );
}
