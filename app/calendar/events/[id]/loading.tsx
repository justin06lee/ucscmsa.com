import { Bone, Loading } from "@/components/skeleton";

// The event page's shape (cover left, details right; stacked on phones).
export default function EventLoading() {
  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-10">
      <Loading label="Loading the event">
        <Bone className="h-11 w-40" />
        <div className="mt-3 grid gap-7 md:grid-cols-[300px_minmax(0,1fr)] md:gap-10 lg:grid-cols-[380px_minmax(0,1fr)] lg:gap-12">
          <Bone className="mx-auto aspect-[4/5] w-full max-w-[380px] rounded-2xl" />
          <div className="flex flex-col gap-4">
            <Bone className="h-10 w-3/4" />
            <Bone className="h-12 w-1/2" />
            <Bone className="h-12 w-2/3" />
            <Bone className="h-32 w-full rounded-2xl" />
          </div>
        </div>
      </Loading>
    </div>
  );
}
