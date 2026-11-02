import { ListSkeleton } from "@/components/list-skeleton";

// Only list pages get a loading boundary: one above a page that calls notFound() would turn its 404 into a 200 (D-095).
export default function Loading() {
  return <ListSkeleton label="Loading jobs" />;
}
