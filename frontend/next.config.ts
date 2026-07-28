import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  outputFileTracingRoot: path.resolve(__dirname),
  // Imagem Docker (frontend/Dockerfile) copia so .next/standalone + .next/static
  // + public - sem isso o build nao produz esses artefatos e o Dockerfile falha.
  output: "standalone",
};

export default nextConfig;
