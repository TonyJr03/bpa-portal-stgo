import PocketBase from 'pocketbase';

/**
 * URL del servidor PocketBase.
 *
 * Se lee desde la variable de entorno PUBLIC_PB_URL (definida en .env).
 * El prefijo PUBLIC_ es obligatorio en Astro para que la variable esté
 * disponible tanto en build time (SSG) como en runtime (islas Vue en el
 * navegador del cliente).
 *
 * Fallback a 127.0.0.1 para entornos de CI/CD donde no hay .env.
 *
 * ⚠️ NUNCA hardcodear 127.0.0.1 aquí — esa dirección solo funciona en el
 *    dispositivo donde corre PocketBase. Los clientes en red local necesitan
 *    la IP real del servidor (ej: http://192.168.1.105:8090).
 */
const PB_URL = import.meta.env.PUBLIC_PB_URL ?? 'http://127.0.0.1:8090';

export const pb = new PocketBase(PB_URL);

// Desactivamos la cancelación automática para evitar errores en Astro (SSR)
pb.autoCancellation(false);

/**
 * Wrapper seguro para llamadas a PocketBase dentro de `getStaticPaths`.
 *
 * En entornos de CI/CD (ej: GitHub Actions), PocketBase no está disponible
 * en 127.0.0.1:8090, por lo que cualquier fetch lanzaría un ECONNREFUSED
 * que mataría el build. Esta función atrapa ese error y devuelve un array
 * vacío, permitiendo que Astro genere 0 rutas dinámicas en lugar de fallar.
 *
 * @param fetcher   - Función async que ejecuta la llamada a PocketBase.
 * @param coleccion - Nombre de la colección (solo para el mensaje de log).
 * @returns         - El resultado del fetcher, o [] si PocketBase no responde.
 *
 * @ejemplo
 *   const tramites = await fetchParaBuild(
 *     () => pb.collection('tramites').getFullList({ sort: 'orden' }),
 *     'tramites'
 *   );
 */
export async function fetchParaBuild<T>(
  fetcher: () => Promise<T[]>,
  coleccion: string
): Promise<T[]> {
  try {
    return await fetcher();
  } catch (error) {
    const mensaje = error instanceof Error ? error.message : String(error);
    console.warn(
      `[BPA] PocketBase no disponible al compilar la colección "${coleccion}". ` +
      `Se omitirán las rutas dinámicas. (${mensaje})`
    );
    return [];
  }
}
