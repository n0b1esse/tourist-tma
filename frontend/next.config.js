/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Статический экспорт: Mini App целиком client-side, серверных роутов/API нет.
  // Статику отдаёт уже работающий на VPS Caddy — Node-контейнер на хосте не нужен.
  output: "export",
  trailingSlash: true,
  images: { unoptimized: true },
};

module.exports = nextConfig;
