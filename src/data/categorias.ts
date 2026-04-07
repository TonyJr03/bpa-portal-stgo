/**
 * @file     src/data/categorias.ts
 * @propósito Fuente única de verdad para las 5 categorías de productos
 *
 * Se importa en:
 *   - src/pages/[lang]/productos/index.astro
 *   - src/pages/[lang]/productos/[categoria].astro
 *   - src/pages/[lang]/productos/[categoria]/[producto].astro
 *
 * Separado en un archivo de datos para evitar:
 *   1. Duplicación del array en 3 lugares
 *   2. Problemas de scope en getStaticPaths() de Astro
 *   3. Inconsistencias si se actualiza solo en un lugar
 */

export interface Categoria {
  slug: 'banca-personal' | 'banca-corporativa' | 'banca-electronica' | 'banca-internacional' | 'otros-servicios';
  icono?: string;
}

/**
 * Las 5 categorías de productos del BPA.
 * slug: identificador único (inmutable, usado en URLs y base de datos)
 * icono: ícono tabler para mostrar en la UI (definición técnica)
 *
 * Los textos (nombre, descripción) se obtienen vía i18n con claves:
 *   cat.${slug}.nombre
 *   cat.${slug}.desc
 */
export const CATEGORIAS: Categoria[] = [
  { slug: 'banca-personal',      icono: 'user-dollar'        },
  { slug: 'banca-corporativa',   icono: 'building-factory-2' },
  { slug: 'banca-electronica',   icono: 'device-mobile'      },
  { slug: 'banca-internacional', icono: 'globe'              },
  { slug: 'otros-servicios',     icono: 'layout-grid'        },
];

/**
 * Variante sin iconos: usada en getStaticPaths de rutas anidadas
 * donde solo necesitamos los slugs para las queries a BD.
 */
export const CATEGORIAS_SLUGS = CATEGORIAS.map(cat => ({ slug: cat.slug }));
