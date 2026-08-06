import { AlertTriangle, Info } from "lucide-react";

export function StatusBanner({
  kind,
  message,
  detail,
}: {
  kind: "info" | "error";
  message: string;
  detail?: string;
}) {
  const Icon = kind === "error" ? AlertTriangle : Info;
  return (
    <div
      role={kind === "error" ? "alert" : "status"}
      className={`mb-6 flex items-start gap-3 rounded-md border p-4 text-sm ${
        kind === "error"
          ? "border-danger/50 bg-danger/10 text-danger"
          : "border-line bg-surface text-fg/90"
      }`}
    >
      <Icon className="mt-0.5 size-5 shrink-0" aria-hidden />
      <div>
        <p className="font-semibold">{message}</p>
        {detail ? <p className="mt-1 text-fg/80">{detail}</p> : null}
      </div>
    </div>
  );
}