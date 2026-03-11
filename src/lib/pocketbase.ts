import PocketBase from 'pocketbase';

// Apuntamos a la dirección donde se ejecuta tu PocketBase local
export const pb = new PocketBase('http://127.0.0.1:8090');

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
