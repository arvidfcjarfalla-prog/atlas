/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: [
    "@atlas/ui",
    "@atlas/map-core",
    "@atlas/map-modules",
    "@atlas/data-models",
  ],
  async redirects() {
    return [
      { source: "/dashboard", destination: "/app/gallery", permanent: true },
      { source: "/login", destination: "/auth/login", permanent: true },
      { source: "/signup", destination: "/auth/signup", permanent: true },
      { source: "/maps/new", destination: "/app/map/new", permanent: true },
      { source: "/maps/:id/edit", destination: "/app/map/:id", permanent: true },
      { source: "/maps/:id", destination: "/app/map/:id", permanent: true },
    ];
  },
};

export default nextConfig;
