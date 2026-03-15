import Link from "next/link";

interface MapCard {
  id: string;
  title: string;
  description: string;
  theme: "editorial" | "explore" | "decision";
  href: string;
  status: "live" | "coming-soon";
}

const maps: MapCard[] = [
  {
    id: "create",
    title: "Create Map",
    description: "Upload a CSV and describe a map — AI generates it for you.",
    theme: "explore",
    href: "/create",
    status: "live",
  },
  {
    id: "disasters",
    title: "Disasters",
    description: "Real-time earthquakes, wildfires, and natural disasters worldwide.",
    theme: "editorial",
    href: "/disasters",
    status: "live",
  },
  {
    id: "conflict",
    title: "Conflict",
    description: "Global conflict incidents, military activity, and geopolitical events.",
    theme: "explore",
    href: "/conflict",
    status: "coming-soon",
  },
  {
    id: "infrastructure",
    title: "Infrastructure",
    description: "Power plants, pipelines, submarine cables, and critical infrastructure.",
    theme: "decision",
    href: "/infrastructure",
    status: "coming-soon",
  },
  {
    id: "supply-chain",
    title: "Supply Chain",
    description: "Global shipping routes, port congestion, and trade disruptions.",
    theme: "decision",
    href: "/supply-chain",
    status: "coming-soon",
  },
  {
    id: "todo",
    title: "Todo",
    description: "Keep track of tasks and what needs to be done.",
    theme: "explore",
    href: "/todo",
    status: "live",
  },
];

export default function ExplorePage() {
  return (
    <div data-theme="explore" className="h-full overflow-auto bg-background text-foreground">
      <div className="max-w-5xl mx-auto px-6 py-16">
        <header className="mb-12">
          <h1 className="text-3xl font-bold tracking-tight mb-2">Atlas</h1>
          <p className="text-muted-foreground text-lg">
            Real-time maps for understanding the world.
          </p>
        </header>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {maps.map((map) => (
            <Link
              key={map.id}
              href={map.status === "live" ? map.href : "#"}
              className={`group relative rounded-lg border bg-card p-6 transition-colors ${
                map.status === "live"
                  ? "hover:border-primary/50 cursor-pointer"
                  : "opacity-60 cursor-default"
              }`}
            >
              <div className="flex items-center gap-2 mb-3">
                <span data-theme={map.theme} className="w-2 h-2 rounded-full bg-primary" />
                <span className="text-label font-mono uppercase text-muted-foreground">
                  {map.theme}
                </span>
                {map.status === "coming-soon" && (
                  <span className="text-label font-mono uppercase text-muted-foreground ml-auto border border-border rounded px-1.5 py-0.5">
                    Soon
                  </span>
                )}
              </div>
              <h2 className="text-heading mb-1">{map.title}</h2>
              <p className="text-body text-muted-foreground">
                {map.description}
              </p>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
