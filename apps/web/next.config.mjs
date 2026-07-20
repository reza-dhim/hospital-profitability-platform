/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@hpp/ui", "@hpp/contracts"],
};

export default nextConfig;
