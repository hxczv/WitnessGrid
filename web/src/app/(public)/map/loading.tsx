export default function MapLoading() {
  return (
    <div className="relative h-[calc(100dvh-5rem)] lg:h-dvh">
      <div className="absolute left-3 top-3 h-72 w-[min(20rem,calc(100vw-1.5rem))] animate-pulse rounded-md border hairline bg-surface" />
      <div className="absolute inset-x-3 bottom-3 mx-auto h-24 w-full max-w-xl animate-pulse rounded-md border hairline bg-surface" />
    </div>
  );
}
