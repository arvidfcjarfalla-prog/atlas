export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // overflow-x-clip prevents horizontal scroll from hero/ticker without creating a scroll container — essential so position: sticky children (e.g. AtlasRenderPipeline map column) stick to the viewport, not this wrapper. overflow-y-auto would also break sticky; omit it entirely.
  return (
    <div className="min-h-screen overflow-x-clip" style={{ background: "#0d1217" }}>
      {children}
    </div>
  );
}
