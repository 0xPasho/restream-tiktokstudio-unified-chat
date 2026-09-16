/**
 * Next llama a esto una vez al arrancar el servidor, antes de atender pedidos.
 * Aquí levantamos los colectores para que `npm run dev` sea lo único que haya
 * que correr: no hay un segundo proceso que recordar.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;   // no en el runtime edge
  const { startCollectors } = await import('./src/server/collector');
  startCollectors();
}
