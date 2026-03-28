const S: React.CSSProperties = { width: 28, height: 28, flexShrink: 0 };

type IconName = "research" | "chart" | "pen" | "grid" | "globe" | "building" | "lock" | "database" | "users" | "bolt" | "shield" | "target";

interface CaseIconProps {
  name: IconName;
  color: string;
  hover?: boolean;
}

export function CaseIcon({ name, color, hover }: CaseIconProps) {
  const o = hover ? 0.7 : 0.35;
  const sw = 1.5;

  const icons: Record<IconName, React.ReactNode> = {
    research: (
      <svg style={S} viewBox="0 0 24 24" fill="none">
        <circle cx="10" cy="10" r="6" stroke={color} strokeWidth={sw} strokeOpacity={o} />
        <path d="M14.5,14.5L20,20" stroke={color} strokeWidth={sw} strokeOpacity={o} strokeLinecap="round" />
        <circle cx="10" cy="10" r="2" fill={color} fillOpacity={o * 0.5} />
      </svg>
    ),
    chart: (
      <svg style={S} viewBox="0 0 24 24" fill="none">
        <rect x="3" y="12" width="4" height="8" rx="1" fill={color} fillOpacity={o * 0.6} />
        <rect x="10" y="6" width="4" height="14" rx="1" fill={color} fillOpacity={o * 0.8} />
        <rect x="17" y="9" width="4" height="11" rx="1" fill={color} fillOpacity={o * 0.7} />
      </svg>
    ),
    pen: (
      <svg style={S} viewBox="0 0 24 24" fill="none">
        <path d="M4,20L8,19L19,8L16,5L5,16Z" stroke={color} strokeWidth={sw} strokeOpacity={o} strokeLinejoin="round" />
        <path d="M14,7L17,10" stroke={color} strokeWidth={sw} strokeOpacity={o} />
      </svg>
    ),
    grid: (
      <svg style={S} viewBox="0 0 24 24" fill="none">
        <rect x="3" y="3" width="7" height="7" rx="1.5" stroke={color} strokeWidth={sw} strokeOpacity={o} />
        <rect x="14" y="3" width="7" height="7" rx="1.5" stroke={color} strokeWidth={sw} strokeOpacity={o} />
        <rect x="3" y="14" width="7" height="7" rx="1.5" stroke={color} strokeWidth={sw} strokeOpacity={o} />
        <rect x="14" y="14" width="7" height="7" rx="1.5" fill={color} fillOpacity={o * 0.4} stroke={color} strokeWidth={sw} strokeOpacity={o} />
      </svg>
    ),
    globe: (
      <svg style={S} viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="9" stroke={color} strokeWidth={sw} strokeOpacity={o} />
        <ellipse cx="12" cy="12" rx="4" ry="9" stroke={color} strokeWidth={sw * 0.7} strokeOpacity={o * 0.6} />
        <path d="M3,12L21,12" stroke={color} strokeWidth={sw * 0.7} strokeOpacity={o * 0.5} />
      </svg>
    ),
    building: (
      <svg style={S} viewBox="0 0 24 24" fill="none">
        <rect x="4" y="4" width="16" height="16" rx="2" stroke={color} strokeWidth={sw} strokeOpacity={o} />
        <rect x="8" y="8" width="3" height="3" rx="0.5" fill={color} fillOpacity={o * 0.5} />
        <rect x="13" y="8" width="3" height="3" rx="0.5" fill={color} fillOpacity={o * 0.5} />
        <rect x="8" y="14" width="3" height="6" rx="0.5" fill={color} fillOpacity={o * 0.4} />
        <rect x="13" y="14" width="3" height="3" rx="0.5" fill={color} fillOpacity={o * 0.5} />
      </svg>
    ),
    lock: (
      <svg style={S} viewBox="0 0 24 24" fill="none">
        <rect x="5" y="11" width="14" height="10" rx="2" stroke={color} strokeWidth={sw} strokeOpacity={o} />
        <path d="M8,11V8a4,4,0,0,1,8,0v3" stroke={color} strokeWidth={sw} strokeOpacity={o} />
        <circle cx="12" cy="16" r="1.5" fill={color} fillOpacity={o * 0.6} />
      </svg>
    ),
    database: (
      <svg style={S} viewBox="0 0 24 24" fill="none">
        <ellipse cx="12" cy="6" rx="8" ry="3" stroke={color} strokeWidth={sw} strokeOpacity={o} />
        <path d="M4,6v12c0,1.66,3.58,3,8,3s8-1.34,8-3V6" stroke={color} strokeWidth={sw} strokeOpacity={o} />
        <path d="M4,12c0,1.66,3.58,3,8,3s8-1.34,8-3" stroke={color} strokeWidth={sw * 0.7} strokeOpacity={o * 0.5} />
      </svg>
    ),
    users: (
      <svg style={S} viewBox="0 0 24 24" fill="none">
        <circle cx="9" cy="8" r="3.5" stroke={color} strokeWidth={sw} strokeOpacity={o} />
        <path d="M2,20c0-3.31,3.13-6,7-6s7,2.69,7,6" stroke={color} strokeWidth={sw} strokeOpacity={o} />
        <circle cx="17" cy="9" r="2.5" stroke={color} strokeWidth={sw * 0.7} strokeOpacity={o * 0.5} />
        <path d="M18,14c2.76,.58,4,2.42,4,4.5" stroke={color} strokeWidth={sw * 0.7} strokeOpacity={o * 0.5} />
      </svg>
    ),
    bolt: (
      <svg style={S} viewBox="0 0 24 24" fill="none">
        <path d="M13,2L4,14h7l-2,8L20,10H13Z" stroke={color} strokeWidth={sw} strokeOpacity={o} strokeLinejoin="round" fill={color} fillOpacity={o * 0.15} />
      </svg>
    ),
    shield: (
      <svg style={S} viewBox="0 0 24 24" fill="none">
        <path d="M12,3L4,7v5c0,4.42,3.42,8.56,8,9.5c4.58-.94,8-5.08,8-9.5V7Z" stroke={color} strokeWidth={sw} strokeOpacity={o} />
        <path d="M9,12l2,2l4-4" stroke={color} strokeWidth={sw} strokeOpacity={o} strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
    target: (
      <svg style={S} viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="9" stroke={color} strokeWidth={sw} strokeOpacity={o} />
        <circle cx="12" cy="12" r="5" stroke={color} strokeWidth={sw * 0.7} strokeOpacity={o * 0.6} />
        <circle cx="12" cy="12" r="1.5" fill={color} fillOpacity={o * 0.6} />
      </svg>
    ),
  };

  return <>{icons[name] ?? null}</>;
}
