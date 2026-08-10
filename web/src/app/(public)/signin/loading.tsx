export default function SignInLoading() {
  return (
    <main className="mx-auto flex min-h-[60vh] max-w-lg flex-col justify-center px-4 py-12">
      <div className="size-10 animate-pulse rounded-md bg-surface" />
      <div className="mt-4 h-8 w-1/2 animate-pulse rounded-md bg-surface" />
      <div className="mt-8 h-11 w-full animate-pulse rounded-md border hairline bg-surface" />
      <div className="mt-4 h-11 w-full animate-pulse rounded-md border hairline bg-surface" />
    </main>
  );
}
