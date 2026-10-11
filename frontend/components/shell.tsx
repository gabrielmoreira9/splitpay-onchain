import { Header } from "./header";

export function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative min-h-screen overflow-hidden">
      <div className="app-grid pointer-events-none absolute inset-x-0 top-0 h-[620px]" />
      <Header />
      <main className="relative mx-auto max-w-[1320px] px-5 py-10 md:px-8 md:py-14">{children}</main>
    </div>
  );
}
