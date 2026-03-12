/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: [
    "@atlas/ui",
    "@atlas/map-core",
    "@atlas/map-modules",
    "@atlas/data-models",
  ],
};

export default nextConfig;
