import { ListSkeleton } from "@/components/skeleton";

// Every admin and board page: shown at once on navigation inside /admin while
// the page's data loads (the layout and its header stay).
export default function AdminLoading() {
  return <ListSkeleton label="Loading" />;
}
