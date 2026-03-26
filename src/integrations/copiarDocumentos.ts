/**
 * @integracion  copiarDocumentos
 * @ruta         src/integrations/copiarDocumentos.ts
 * @descripcion  Integración Astro que se ejecuta antes del build y copia todos
 *               los archivos de la colección `documentos` desde el filesystem
 *               local de PocketBase hacia public/descargas/.
 *
 *               Al estar en public/, Astro los incluye automáticamente en
 *               /dist/descargas/ como archivos estáticos servidos desde el
 *               mismo origen que el sitio. Esto permite usar el atributo
 *               download="nombre legible" en los <a> sin ningún JavaScript.
 *
 * @configuracion
 *   PB_STORAGE_PATH        → ruta relativa desde la raíz del proyecto Astro
 *                            a la carpeta pb_data/storage de PocketBase.
 *   DOCUMENTOS_COLLECTION_ID → ID de la colección `documentos`.
 *                            Visible en el panel admin de PocketBase.
 *
 * @flujo
 *   1. Hook astro:build:start se dispara antes de que Astro procese cualquier página
 *   2. Se vacía public/descargas/ para garantizar consistencia con PocketBase
 *      (documentos eliminados de PB no quedan como archivos huérfanos en el sitio)
 *   3. Se consulta la colección `documentos` en PocketBase via SDK
 *   4. Por cada registro, se copia el archivo desde:
 *      {PB_STORAGE_PATH}/{DOCUMENTOS_COLLECTION_ID}/{recordId}/{filename}
 *      hacia:
 *      public/descargas/{recordId}.{ext}
 *   5. Astro incluye public/descargas/ en el build → /dist/descargas/
 *   6. El widget usa href="/descargas/{id}.{ext}" — same-origin — download funciona
 *
 * @nota_arquitectura
 *   Los archivos se sirven desde el mismo origen que el sitio (:80), no desde
 *   PocketBase (:8090). Esto es imprescindible para que el atributo download=""
 *   en los <a> funcione correctamente — los navegadores ignoran download en
 *   recursos cross-origin. Por eso se mantiene esta arquitectura SSG y no se
 *   sirve directamente desde pb.files.getURL().
 */

import type { AstroIntegration } from 'astro';
import { copyFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { join }                                        from 'node:path';
import PocketBase                                      from 'pocketbase';

// ── Configuración ─────────────────────────────────────────────────────────────

/**
 * Ruta a pb_data/storage, relativa a la raíz del proyecto Astro.
 * Ajusta según la estructura de tu repositorio.
 *
 * Ejemplo con:
 *   bpa-portal-stgo/
 *     bpa-frontend/   ← raíz del proyecto Astro (process.cwd())
 *     bpa-backend/    ← PocketBase
 *
 * → './bpa-backend/pb_data/storage'
 */
const PB_STORAGE_PATH = './bpa-backend/pb_data/storage';

/** ID de la colección `documentos`. Visible en el panel admin de PocketBase. */
const DOCUMENTOS_COLLECTION_ID = 'pbc_3758627238';

/** URL del servidor PocketBase local. */
const PB_URL = 'http://127.0.0.1:8090';

// ── Interfaz mínima ───────────────────────────────────────────────────────────
interface Documento {
  id: string;
  archivo: string;
}

// ── Integración ───────────────────────────────────────────────────────────────
export function copiarDocumentos(): AstroIntegration {
  return {
    name: 'bpa:copiar-documentos',

    hooks: {
      /**
       * astro:build:start se ejecuta al inicio del build, antes de que Astro
       * procese páginas o copie public/. Es el momento correcto para poblar
       * public/descargas/ con los archivos de PocketBase.
       */
      'astro:build:start': async ({ logger }) => {
        logger.info('Copiando documentos desde PocketBase storage...');

        const destino = join(process.cwd(), 'public', 'descargas');

        // ── LIMPIEZA PREVIA ────────────────────────────────────────────────────
        if (existsSync(destino)) {
          rmSync(destino, { recursive: true, force: true });
          logger.info('Carpeta public/descargas/ vaciada correctamente.');
        }

        // Recreamos la carpeta limpia para recibir la copia fresca
        mkdirSync(destino, { recursive: true });

        // ── CONSULTA A POCKETBASE ──────────────────────────────────────────────
        const pb = new PocketBase(PB_URL);
        pb.autoCancellation(false);

        let documentos: Documento[] = [];
        try {
          documentos = await pb.collection('documentos').getFullList<Documento>();
        } catch (err) {
          logger.error(`No se pudo conectar a PocketBase: ${err}`);
          logger.warn('El build continuará pero sin documentos descargables.');
          return;
        }

        // ── COPIA DE ARCHIVOS ──────────────────────────────────────────────────
        let copiados = 0;
        let fallidos = 0;

        for (const doc of documentos) {
          const ext    = doc.archivo.split('.').pop() ?? 'bin';
          const origen = join(
            process.cwd(),
            PB_STORAGE_PATH,
            DOCUMENTOS_COLLECTION_ID,
            doc.id,
            doc.archivo
          );
          const destFinal = join(destino, `${doc.id}.${ext}`);

          if (!existsSync(origen)) {
            logger.warn(`Archivo no encontrado en storage: ${origen}`);
            fallidos++;
            continue;
          }

          try {
            copyFileSync(origen, destFinal);
            copiados++;
          } catch (err) {
            logger.error(`Error copiando ${doc.archivo}: ${err}`);
            fallidos++;
          }
        }

        logger.info(
          `Documentos: ${copiados} copiados, ${fallidos} fallidos.`
        );
      },
    },
  };
}
