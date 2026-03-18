"use client";

import { useState, useMemo } from "react";

// ─── Comparable platform benchmarks ───
const BENCHMARKS = {
  midjourney: {
    name: "Midjourney",
    type: "AI Image Generation",
    arpu: 12,
    paidConversion: 6.7, // ~1.4M paying / ~21M community
    arrMillions: 500,
    payingUsers: 1_400_000,
    grossMargin: 55,
    model: "Pure subscription ($10–$120/mo)",
  },
  runway: {
    name: "Runway",
    type: "AI Video Generation",
    arpu: 25,
    paidConversion: 4.5,
    arrMillions: 150,
    payingUsers: 500_000,
    grossMargin: 45,
    model: "Subscription + credits",
  },
  mapbox: {
    name: "Mapbox",
    type: "Maps Platform (Dev)",
    arpu: 85,
    paidConversion: 2.5, // ~100K paying / ~4M devs
    arrMillions: 100,
    payingUsers: 100_000,
    grossMargin: 65,
    model: "Free tier + pay-as-you-go",
  },
  carto: {
    name: "CARTO",
    type: "Spatial Analytics",
    arpu: 250,
    paidConversion: 8,
    arrMillions: 30,
    payingUsers: 10_000,
    grossMargin: 70,
    model: "Tiered subscription + usage",
  },
  felt: {
    name: "Felt",
    type: "Collaborative Maps",
    arpu: 20,
    paidConversion: 5,
    arrMillions: 10,
    payingUsers: 40_000,
    grossMargin: 75,
    model: "Freemium + team plans",
  },
} as const;

// ─── Atlas cost constants ───
const SONNET_INPUT_PER_1K = 0.003;
const SONNET_OUTPUT_PER_1K = 0.015;
const AVG_INPUT_TOKENS = 14_000; // ~1.5 attempts avg
const AVG_OUTPUT_TOKENS = 3_000;
const COST_PER_MAP =
  (AVG_INPUT_TOKENS / 1000) * SONNET_INPUT_PER_1K +
  (AVG_OUTPUT_TOKENS / 1000) * SONNET_OUTPUT_PER_1K; // ~$0.087

// ─── Atlas hybrid pricing tiers ───
const ATLAS_TIERS = [
  {
    name: "Free",
    price: 0,
    creditsIncluded: 5,
    creditsPerDay: true,
    overagePrice: 0,
    color: "bg-gray-100 text-gray-800",
  },
  {
    name: "Starter",
    price: 9,
    creditsIncluded: 50,
    creditsPerDay: false,
    overagePrice: 0.2,
    color: "bg-blue-100 text-blue-800",
  },
  {
    name: "Pro",
    price: 29,
    creditsIncluded: 200,
    creditsPerDay: false,
    overagePrice: 0.15,
    color: "bg-purple-100 text-purple-800",
  },
  {
    name: "Team",
    price: 79,
    creditsIncluded: 1000,
    creditsPerDay: false,
    overagePrice: 0.1,
    color: "bg-orange-100 text-orange-800",
  },
];

// ─── Credit pack pricing ───
const CREDIT_PACKS = [
  { credits: 10, price: 2, perCredit: 0.2 },
  { credits: 50, price: 8, perCredit: 0.16 },
  { credits: 200, price: 25, perCredit: 0.125 },
  { credits: 500, price: 50, perCredit: 0.1 },
];

function formatCurrency(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
}

function formatNumber(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toFixed(0);
}

// ─── Simulation component ───
export default function PricingModelPage() {
  const [totalUsers, setTotalUsers] = useState(2000);
  const [freePercent, setFreePercent] = useState(75);
  const [starterPercent, setStarterPercent] = useState(15);
  const [proPercent, setProPercent] = useState(7);
  const [avgMapsPerFree, setAvgMapsPerFree] = useState(3);
  const [avgOverageStarter, setAvgOverageStarter] = useState(10);
  const [avgOveragePro, setAvgOveragePro] = useState(30);
  const [avgOverageTeam, setAvgOverageTeam] = useState(100);
  const [creditPackSalesPerMonth, setCreditPackSalesPerMonth] = useState(50);
  const [avgPackIndex, setAvgPackIndex] = useState(1); // 50-credit pack

  const teamPercent = Math.max(0, 100 - freePercent - starterPercent - proPercent);

  const sim = useMemo(() => {
    const users = {
      free: Math.round(totalUsers * (freePercent / 100)),
      starter: Math.round(totalUsers * (starterPercent / 100)),
      pro: Math.round(totalUsers * (proPercent / 100)),
      team: Math.round(totalUsers * (teamPercent / 100)),
    };

    // Monthly maps generated
    const freeMapsPerMonth = avgMapsPerFree * 30; // daily limit × 30
    const maps = {
      free: users.free * Math.min(freeMapsPerMonth, avgMapsPerFree * 30),
      starter: users.starter * (50 + avgOverageStarter),
      pro: users.pro * (200 + avgOveragePro),
      team: users.team * (1000 + avgOverageTeam),
    };
    const totalMaps = maps.free + maps.starter + maps.pro + maps.team;

    // Subscription revenue
    const subRevenue = {
      free: 0,
      starter: users.starter * 9,
      pro: users.pro * 29,
      team: users.team * 79,
    };

    // Overage revenue
    const overageRevenue = {
      starter: users.starter * avgOverageStarter * 0.2,
      pro: users.pro * avgOveragePro * 0.15,
      team: users.team * avgOverageTeam * 0.1,
    };

    // Credit pack revenue
    const packRevenue =
      creditPackSalesPerMonth * CREDIT_PACKS[avgPackIndex].price;
    const packMaps =
      creditPackSalesPerMonth * CREDIT_PACKS[avgPackIndex].credits;

    // Totals
    const totalSubRevenue =
      subRevenue.free + subRevenue.starter + subRevenue.pro + subRevenue.team;
    const totalOverageRevenue =
      overageRevenue.starter + overageRevenue.pro + overageRevenue.team;
    const totalRevenue = totalSubRevenue + totalOverageRevenue + packRevenue;

    const totalMapsAll = totalMaps + packMaps;
    const totalApiCost = totalMapsAll * COST_PER_MAP;
    const grossProfit = totalRevenue - totalApiCost;
    const grossMargin = totalRevenue > 0 ? (grossProfit / totalRevenue) * 100 : 0;

    const mrr = totalRevenue;
    const arr = mrr * 12;

    const paidUsers = users.starter + users.pro + users.team;
    const arpu = paidUsers > 0 ? totalRevenue / paidUsers : 0;
    const conversionRate =
      totalUsers > 0 ? (paidUsers / totalUsers) * 100 : 0;

    return {
      users,
      maps,
      totalMaps: totalMapsAll,
      subRevenue,
      overageRevenue,
      packRevenue,
      totalSubRevenue,
      totalOverageRevenue,
      totalRevenue,
      totalApiCost,
      grossProfit,
      grossMargin,
      mrr,
      arr,
      arpu,
      paidUsers,
      conversionRate,
    };
  }, [
    totalUsers,
    freePercent,
    starterPercent,
    proPercent,
    teamPercent,
    avgMapsPerFree,
    avgOverageStarter,
    avgOveragePro,
    avgOverageTeam,
    creditPackSalesPerMonth,
    avgPackIndex,
  ]);

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="mx-auto max-w-7xl">
        <h1 className="mb-2 text-3xl font-bold text-gray-900">
          Atlas Revenue Model
        </h1>
        <p className="mb-8 text-gray-500">
          Hybrid subscription + credits — interactive simulation
        </p>

        {/* ─── KPI Cards ─── */}
        <div className="mb-8 grid grid-cols-2 gap-4 md:grid-cols-4">
          {[
            { label: "MRR", value: formatCurrency(sim.mrr) },
            { label: "ARR", value: formatCurrency(sim.arr) },
            { label: "Gross Margin", value: `${sim.grossMargin.toFixed(0)}%` },
            { label: "ARPU (paid)", value: `$${sim.arpu.toFixed(2)}/mo` },
          ].map((kpi) => (
            <div
              key={kpi.label}
              className="rounded-lg border bg-white p-4 shadow-sm"
            >
              <div className="text-sm text-gray-500">{kpi.label}</div>
              <div className="text-2xl font-bold text-gray-900">
                {kpi.value}
              </div>
            </div>
          ))}
        </div>

        <div className="grid gap-8 lg:grid-cols-3">
          {/* ─── Left: Controls ─── */}
          <div className="space-y-6 lg:col-span-1">
            <div className="rounded-lg border bg-white p-5 shadow-sm">
              <h2 className="mb-4 text-lg font-semibold">User Distribution</h2>

              <label className="mb-1 block text-sm text-gray-600">
                Total Users: <strong>{totalUsers.toLocaleString()}</strong>
              </label>
              <input
                type="range"
                min={100}
                max={50000}
                step={100}
                value={totalUsers}
                onChange={(e) => setTotalUsers(Number(e.target.value))}
                className="mb-4 w-full"
              />

              {[
                { label: "Free %", value: freePercent, set: setFreePercent },
                {
                  label: "Starter %",
                  value: starterPercent,
                  set: setStarterPercent,
                },
                { label: "Pro %", value: proPercent, set: setProPercent },
              ].map((s) => (
                <div key={s.label} className="mb-3">
                  <label className="mb-1 block text-sm text-gray-600">
                    {s.label}: <strong>{s.value}%</strong> (
                    {Math.round(totalUsers * (s.value / 100))} users)
                  </label>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={s.value}
                    onChange={(e) => s.set(Number(e.target.value))}
                    className="w-full"
                  />
                </div>
              ))}
              <div className="text-sm text-gray-500">
                Team %: <strong>{teamPercent}%</strong> (
                {Math.round(totalUsers * (teamPercent / 100))} users)
              </div>
            </div>

            <div className="rounded-lg border bg-white p-5 shadow-sm">
              <h2 className="mb-4 text-lg font-semibold">Usage Patterns</h2>

              <label className="mb-1 block text-sm text-gray-600">
                Free: avg maps/day:{" "}
                <strong>{avgMapsPerFree}</strong>
              </label>
              <input
                type="range"
                min={1}
                max={5}
                value={avgMapsPerFree}
                onChange={(e) => setAvgMapsPerFree(Number(e.target.value))}
                className="mb-3 w-full"
              />

              <label className="mb-1 block text-sm text-gray-600">
                Starter overage/mo:{" "}
                <strong>{avgOverageStarter} maps</strong>
              </label>
              <input
                type="range"
                min={0}
                max={100}
                value={avgOverageStarter}
                onChange={(e) => setAvgOverageStarter(Number(e.target.value))}
                className="mb-3 w-full"
              />

              <label className="mb-1 block text-sm text-gray-600">
                Pro overage/mo:{" "}
                <strong>{avgOveragePro} maps</strong>
              </label>
              <input
                type="range"
                min={0}
                max={200}
                value={avgOveragePro}
                onChange={(e) => setAvgOveragePro(Number(e.target.value))}
                className="mb-3 w-full"
              />

              <label className="mb-1 block text-sm text-gray-600">
                Team overage/mo:{" "}
                <strong>{avgOverageTeam} maps</strong>
              </label>
              <input
                type="range"
                min={0}
                max={500}
                value={avgOverageTeam}
                onChange={(e) => setAvgOverageTeam(Number(e.target.value))}
                className="w-full"
              />
            </div>

            <div className="rounded-lg border bg-white p-5 shadow-sm">
              <h2 className="mb-4 text-lg font-semibold">Credit Pack Sales</h2>
              <label className="mb-1 block text-sm text-gray-600">
                Packs sold/mo:{" "}
                <strong>{creditPackSalesPerMonth}</strong>
              </label>
              <input
                type="range"
                min={0}
                max={500}
                value={creditPackSalesPerMonth}
                onChange={(e) =>
                  setCreditPackSalesPerMonth(Number(e.target.value))
                }
                className="mb-3 w-full"
              />
              <label className="mb-1 block text-sm text-gray-600">
                Avg pack size
              </label>
              <select
                value={avgPackIndex}
                onChange={(e) => setAvgPackIndex(Number(e.target.value))}
                className="w-full rounded border p-2 text-sm"
              >
                {CREDIT_PACKS.map((p, i) => (
                  <option key={i} value={i}>
                    {p.credits} credits — ${p.price} (${p.perCredit}/ea)
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* ─── Right: Results ─── */}
          <div className="space-y-6 lg:col-span-2">
            {/* Revenue breakdown */}
            <div className="rounded-lg border bg-white p-5 shadow-sm">
              <h2 className="mb-4 text-lg font-semibold">
                Monthly Revenue Breakdown
              </h2>
              <div className="space-y-3">
                {/* Revenue bar */}
                <div className="flex h-8 overflow-hidden rounded-full">
                  {sim.totalRevenue > 0 && (
                    <>
                      <div
                        className="bg-blue-500"
                        style={{
                          width: `${(sim.totalSubRevenue / sim.totalRevenue) * 100}%`,
                        }}
                        title={`Subscriptions: ${formatCurrency(sim.totalSubRevenue)}`}
                      />
                      <div
                        className="bg-purple-500"
                        style={{
                          width: `${(sim.totalOverageRevenue / sim.totalRevenue) * 100}%`,
                        }}
                        title={`Overage: ${formatCurrency(sim.totalOverageRevenue)}`}
                      />
                      <div
                        className="bg-orange-500"
                        style={{
                          width: `${(sim.packRevenue / sim.totalRevenue) * 100}%`,
                        }}
                        title={`Credit packs: ${formatCurrency(sim.packRevenue)}`}
                      />
                    </>
                  )}
                </div>
                <div className="flex gap-4 text-sm">
                  <span className="flex items-center gap-1">
                    <span className="inline-block h-3 w-3 rounded-full bg-blue-500" />
                    Subscriptions: {formatCurrency(sim.totalSubRevenue)} (
                    {sim.totalRevenue > 0
                      ? ((sim.totalSubRevenue / sim.totalRevenue) * 100).toFixed(0)
                      : 0}
                    %)
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="inline-block h-3 w-3 rounded-full bg-purple-500" />
                    Overage: {formatCurrency(sim.totalOverageRevenue)} (
                    {sim.totalRevenue > 0
                      ? (
                          (sim.totalOverageRevenue / sim.totalRevenue) *
                          100
                        ).toFixed(0)
                      : 0}
                    %)
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="inline-block h-3 w-3 rounded-full bg-orange-500" />
                    Credit packs: {formatCurrency(sim.packRevenue)} (
                    {sim.totalRevenue > 0
                      ? ((sim.packRevenue / sim.totalRevenue) * 100).toFixed(0)
                      : 0}
                    %)
                  </span>
                </div>

                <table className="mt-4 w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-gray-500">
                      <th className="pb-2">Tier</th>
                      <th className="pb-2 text-right">Users</th>
                      <th className="pb-2 text-right">Sub Rev</th>
                      <th className="pb-2 text-right">Overage Rev</th>
                      <th className="pb-2 text-right">Maps/mo</th>
                      <th className="pb-2 text-right">API Cost</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      {
                        tier: "Free",
                        users: sim.users.free,
                        sub: 0,
                        overage: 0,
                        maps: sim.maps.free,
                      },
                      {
                        tier: "Starter ($9)",
                        users: sim.users.starter,
                        sub: sim.subRevenue.starter,
                        overage: sim.overageRevenue.starter,
                        maps: sim.maps.starter,
                      },
                      {
                        tier: "Pro ($29)",
                        users: sim.users.pro,
                        sub: sim.subRevenue.pro,
                        overage: sim.overageRevenue.pro,
                        maps: sim.maps.pro,
                      },
                      {
                        tier: "Team ($79)",
                        users: sim.users.team,
                        sub: sim.subRevenue.team,
                        overage: sim.overageRevenue.team,
                        maps: sim.maps.team,
                      },
                    ].map((row) => (
                      <tr key={row.tier} className="border-b">
                        <td className="py-2 font-medium">{row.tier}</td>
                        <td className="py-2 text-right">
                          {row.users.toLocaleString()}
                        </td>
                        <td className="py-2 text-right">
                          {formatCurrency(row.sub)}
                        </td>
                        <td className="py-2 text-right">
                          {formatCurrency(row.overage)}
                        </td>
                        <td className="py-2 text-right">
                          {formatNumber(row.maps)}
                        </td>
                        <td className="py-2 text-right text-red-600">
                          -{formatCurrency(row.maps * COST_PER_MAP)}
                        </td>
                      </tr>
                    ))}
                    <tr className="border-b">
                      <td className="py-2 font-medium">Credit Packs</td>
                      <td className="py-2 text-right">—</td>
                      <td className="py-2 text-right">—</td>
                      <td className="py-2 text-right">
                        {formatCurrency(sim.packRevenue)}
                      </td>
                      <td className="py-2 text-right">
                        {formatNumber(
                          creditPackSalesPerMonth *
                            CREDIT_PACKS[avgPackIndex].credits
                        )}
                      </td>
                      <td className="py-2 text-right text-red-600">
                        -
                        {formatCurrency(
                          creditPackSalesPerMonth *
                            CREDIT_PACKS[avgPackIndex].credits *
                            COST_PER_MAP
                        )}
                      </td>
                    </tr>
                    <tr className="font-bold">
                      <td className="py-2">Total</td>
                      <td className="py-2 text-right">
                        {totalUsers.toLocaleString()}
                      </td>
                      <td className="py-2 text-right">
                        {formatCurrency(sim.totalSubRevenue)}
                      </td>
                      <td className="py-2 text-right">
                        {formatCurrency(
                          sim.totalOverageRevenue + sim.packRevenue
                        )}
                      </td>
                      <td className="py-2 text-right">
                        {formatNumber(sim.totalMaps)}
                      </td>
                      <td className="py-2 text-right text-red-600">
                        -{formatCurrency(sim.totalApiCost)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* P&L summary */}
            <div className="rounded-lg border bg-white p-5 shadow-sm">
              <h2 className="mb-4 text-lg font-semibold">
                Monthly P&L Summary
              </h2>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span>Total Revenue</span>
                  <span className="font-bold text-green-700">
                    {formatCurrency(sim.totalRevenue)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>API Cost (Claude Sonnet 4)</span>
                  <span className="text-red-600">
                    -{formatCurrency(sim.totalApiCost)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">
                    Cost per map: ${COST_PER_MAP.toFixed(3)}
                  </span>
                  <span className="text-gray-400">
                    {formatNumber(sim.totalMaps)} maps total
                  </span>
                </div>
                <hr />
                <div className="flex justify-between text-base font-bold">
                  <span>Gross Profit</span>
                  <span
                    className={
                      sim.grossProfit >= 0 ? "text-green-700" : "text-red-600"
                    }
                  >
                    {formatCurrency(sim.grossProfit)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Gross Margin</span>
                  <span
                    className={`font-bold ${sim.grossMargin >= 50 ? "text-green-700" : sim.grossMargin >= 30 ? "text-yellow-600" : "text-red-600"}`}
                  >
                    {sim.grossMargin.toFixed(1)}%
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Paid Conversion Rate</span>
                  <span className="font-bold">
                    {sim.conversionRate.toFixed(1)}%
                  </span>
                </div>
              </div>
            </div>

            {/* Comparable platforms */}
            <div className="rounded-lg border bg-white p-5 shadow-sm">
              <h2 className="mb-4 text-lg font-semibold">
                Benchmark: Comparable Platforms
              </h2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-gray-500">
                      <th className="pb-2">Platform</th>
                      <th className="pb-2">Type</th>
                      <th className="pb-2 text-right">ARR</th>
                      <th className="pb-2 text-right">Paying Users</th>
                      <th className="pb-2 text-right">ARPU</th>
                      <th className="pb-2 text-right">Margin</th>
                      <th className="pb-2">Pricing Model</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.values(BENCHMARKS).map((b) => (
                      <tr key={b.name} className="border-b">
                        <td className="py-2 font-medium">{b.name}</td>
                        <td className="py-2 text-gray-500">{b.type}</td>
                        <td className="py-2 text-right">
                          ${b.arrMillions}M
                        </td>
                        <td className="py-2 text-right">
                          {formatNumber(b.payingUsers)}
                        </td>
                        <td className="py-2 text-right">${b.arpu}/mo</td>
                        <td className="py-2 text-right">{b.grossMargin}%</td>
                        <td className="py-2 text-gray-500">{b.model}</td>
                      </tr>
                    ))}
                    {/* Atlas row */}
                    <tr className="border-t-2 border-blue-300 bg-blue-50 font-bold">
                      <td className="py-2">Atlas (sim)</td>
                      <td className="py-2 text-gray-500">AI Maps</td>
                      <td className="py-2 text-right">
                        {formatCurrency(sim.arr)}
                      </td>
                      <td className="py-2 text-right">
                        {formatNumber(sim.paidUsers)}
                      </td>
                      <td className="py-2 text-right">
                        ${sim.arpu.toFixed(0)}/mo
                      </td>
                      <td className="py-2 text-right">
                        {sim.grossMargin.toFixed(0)}%
                      </td>
                      <td className="py-2 text-gray-500">
                        Hybrid (sub + credits)
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* Pricing tiers display */}
            <div className="rounded-lg border bg-white p-5 shadow-sm">
              <h2 className="mb-4 text-lg font-semibold">
                Atlas Pricing Tiers
              </h2>
              <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                {ATLAS_TIERS.map((tier) => (
                  <div
                    key={tier.name}
                    className="rounded-lg border p-4 text-center"
                  >
                    <span
                      className={`inline-block rounded-full px-3 py-1 text-xs font-bold ${tier.color}`}
                    >
                      {tier.name}
                    </span>
                    <div className="mt-3 text-2xl font-bold">
                      {tier.price === 0 ? "Free" : `$${tier.price}/mo`}
                    </div>
                    <div className="mt-1 text-sm text-gray-500">
                      {tier.creditsPerDay
                        ? `${tier.creditsIncluded} maps/day`
                        : `${tier.creditsIncluded} maps/mo`}
                    </div>
                    {tier.overagePrice > 0 && (
                      <div className="mt-1 text-xs text-gray-400">
                        +${tier.overagePrice}/extra map
                      </div>
                    )}
                  </div>
                ))}
              </div>
              <div className="mt-4">
                <h3 className="mb-2 text-sm font-semibold text-gray-600">
                  Credit Packs (one-time purchase)
                </h3>
                <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                  {CREDIT_PACKS.map((p) => (
                    <div
                      key={p.credits}
                      className="rounded border bg-gray-50 p-3 text-center text-sm"
                    >
                      <div className="font-bold">{p.credits} credits</div>
                      <div>${p.price}</div>
                      <div className="text-xs text-gray-400">
                        ${p.perCredit}/map
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Industry insight */}
            <div className="rounded-lg border border-blue-200 bg-blue-50 p-5 text-sm text-blue-900">
              <h3 className="mb-2 font-semibold">Industry Trends (2025–2026)</h3>
              <ul className="list-inside list-disc space-y-1">
                <li>
                  <strong>43% of SaaS</strong> companies now use hybrid pricing
                  (sub + usage) — projected to reach 61% by end of 2026
                </li>
                <li>
                  Hybrid models report <strong>38% higher revenue growth</strong>{" "}
                  vs single-model approaches
                </li>
                <li>
                  Credit-based models grew <strong>126% YoY</strong> — now used
                  by HubSpot, Salesforce, Adobe
                </li>
                <li>
                  AI SaaS gross margins average <strong>50–60%</strong> (vs
                  80–90% traditional SaaS)
                </li>
                <li>
                  Per-seat pricing dropped from 21% to 15% in 12 months —
                  credits/usage replacing it
                </li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
