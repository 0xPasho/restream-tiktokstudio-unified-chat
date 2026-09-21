import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // El indicador de desarrollo se dibuja abajo a la izquierda, justo encima de
  // los mensajes del overlay. En producción no existe, pero la fuente de OBS
  // suele apuntar al servidor de dev mientras trabajas, y ahí sí estorba.
  // Los errores de compilación y de ejecución se siguen mostrando.
  devIndicators: false,

  // `next build` deja en .next/standalone un server.js con sus dependencias ya
  // copiadas. Eso permite correr el chat como un proceso de node suelto, sin la
  // CLI de Next: no reescribe AGENTS.md y su línea de comando no dice «next»,
  // así que los limpiadores de puertos que hacen `pkill -f next` no lo tocan.
  // Ver scripts/service.sh.
  output: 'standalone',

  // El trazado sigue el `resolve(cwd, 'data', 'chat.db')` de src/server/db.ts y
  // se lleva una copia de la base al bundle: peso muerto, y encima con los
  // tokens de la tabla `settings` dentro. El proceso real recibe la ruta por
  // CHAT_DB_PATH, así que esa copia nunca se lee.
  outputFileTracingExcludes: { '**/*': ['data/**'] },
};

export default nextConfig;
