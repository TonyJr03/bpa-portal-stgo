/**
 * @archivo  src/utils/permalinks.ts
 *
 * @descripcion
 *   Utilidades de construcción de URLs del portal BPA.
 *   Versión depurada — se eliminaron todas las funciones del módulo de blog
 *   (desactivado) y la función applyGetPermalinks (reemplazada por navigation.ts).
 *
 *   Funciones que permanecen:
 *
 *   trimSlash(s)              → elimina slashes al inicio y al final de un string
 *                               Usada en Header.astro para detectar la ruta activa.
 *
 *   getCanonical(path)        → construye la URL canónica completa para SEO.
 *                               Usada en Metadata.astro.
 *
 *   getAsset(path)            → URL de un asset estático (ej: /sitemap-index.xml).
 *                               Usada en CommonMeta.astro.
 *
 *   getPermalink(slug, lang)  → construye una URL con prefijo de idioma.
 *                               Para uso puntual en páginas o componentes que
 *                               necesiten un enlace fuera de navigation.ts.
 *
 *   getHomePermalink(lang)    → shorthand para la raíz del idioma activo.
 */

import slugify from 'limax';
import { SITE } from 'astrowind:config';
import { trim } from '~/utils/utils';
import type { Lang } from '~/i18n/utils';

// ── Utilidad base ─────────────────────────────────────────────────────────────

/** Elimina los slashes del inicio y el final de un string. */
export const trimSlash = (s: string) => trim(trim(s, '/'));

// ── Base del sitio ────────────────────────────────────────────────────────────

const BASE_PATHNAME = SITE.base || '/';

// ── Construcción interna de rutas ─────────────────────────────────────────────

const createPath = (...params: string[]) => {
  const paths = params
    .map((el) => trimSlash(el))
    .filter((el) => !!el)
    .join('/');
  return '/' + paths + (SITE.trailingSlash && paths ? '/' : '');
};

// ── Slugificación ─────────────────────────────────────────────────────────────

export const cleanSlug = (text = '') =>
  trimSlash(text)
    .split('/')
    .map((slug) => slugify(slug))
    .join('/');

// ── URL Canónica (SEO) ────────────────────────────────────────────────────────

/**
 * Construye la URL canónica completa para una ruta dada.
 * Usada en Metadata.astro para el tag <link rel="canonical">.
 *
 * @param path  Ruta relativa. Ej: '/es/productos'
 */
export const getCanonical = (path = ''): string | URL => {
  const url = String(new URL(path, SITE.site));
  if (SITE.trailingSlash == false && path && url.endsWith('/')) {
    return url.slice(0, -1);
  } else if (SITE.trailingSlash == true && path && !url.endsWith('/')) {
    return url + '/';
  }
  return url;
};

// ── Assets estáticos ──────────────────────────────────────────────────────────

/**
 * Construye la URL de un asset estático del sitio.
 * Usada en CommonMeta.astro para el enlace al sitemap.
 *
 * @param path  Ruta del asset. Ej: '/sitemap-index.xml'
 */
export const getAsset = (path: string): string =>
  '/' +
  [BASE_PATHNAME, path]
    .map((el) => trimSlash(el))
    .filter((el) => !!el)
    .join('/');

// ── URL con prefijo de idioma ─────────────────────────────────────────────────

/**
 * Construye una URL con el prefijo del idioma activo.
 * Para uso puntual en páginas o componentes que necesiten construir un
 * enlace fuera de navigation.ts.
 *
 * El patrón de URLs del portal es: /[lang]/ruta/subruta
 *
 * @param slug  Ruta sin prefijo de idioma. Ej: 'productos/banca-personal'
 * @param lang  Idioma activo ('es' | 'en'). Por defecto 'es'.
 *
 * @ejemplo
 *   getPermalink('contacto', lang)          → '/es/contacto'
 *   getPermalink('herramientas/mapa', 'en') → '/en/herramientas/mapa'
 *   getPermalink('', lang)                  → '/es'
 */
export const getPermalink = (slug = '', lang: Lang = 'es'): string => {
  // Si el slug ya es una URL absoluta o un ancla, devolverlo sin modificar
  if (
    slug.startsWith('https://') ||
    slug.startsWith('http://')  ||
    slug.startsWith('://')      ||
    slug.startsWith('#')        ||
    slug.startsWith('javascript:')
  ) {
    return slug;
  }

  const cleanedSlug = trimSlash(slug);
  return createPath(BASE_PATHNAME, lang, cleanedSlug);
};

/**
 * Shorthand para la URL de inicio del idioma activo.
 *
 * @param lang  Idioma activo. Por defecto 'es'.
 *
 * @ejemplo
 *   getHomePermalink('es') → '/es'
 *   getHomePermalink('en') → '/en'
 */
export const getHomePermalink = (lang: Lang = 'es'): string =>
  getPermalink('', lang);
