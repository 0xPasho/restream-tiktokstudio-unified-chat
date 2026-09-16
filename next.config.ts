import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // El indicador de desarrollo se dibuja abajo a la izquierda, justo encima de
  // los mensajes del overlay. En producción no existe, pero la fuente de OBS
  // suele apuntar al servidor de dev mientras trabajas, y ahí sí estorba.
  // Los errores de compilación y de ejecución se siguen mostrando.
  devIndicators: false,
};

export default nextConfig;
