export function StatusPill({ paid }: { paid: boolean }) {
  return (
    <span className={`inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-[11px] font-bold ${paid ? "border-[#a3ff68]/20 bg-[#a3ff68]/10 text-[#a3ff68]" : "border-[#f7c76d]/20 bg-[#f7c76d]/10 text-[#f7c76d]"}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${paid ? "bg-[#a3ff68]" : "bg-[#f7c76d]"}`} />
      {paid ? "Paid" : "Pending"}
    </span>
  );
}
