export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen overflow-auto" style={{ background: "#0d1217" }}>
      {children}
    </div>
  );
}
