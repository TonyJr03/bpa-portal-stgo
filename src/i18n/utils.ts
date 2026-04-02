/**
 * @archivo  src/i18n/utils.ts
 *
 * @descripcion
 *   Motor del sistema de internacionalización (i18n) del portal BPA.
 *   Exporta el tipo Lang, las constantes de idiomas soportados, y las
 *   funciones helper para obtener el idioma activo y traducir strings.
 *
 * @uso en páginas Astro
 *   import { getLangFromUrl, useTranslations } from '~/i18n/utils';
 *   const lang = getLangFromUrl(Astro.url);
 *   const t    = useTranslations(lang);
 *   // En el template:
 *   <HeroText title={t('home.hero.title')} />
 *
 * @uso en islas Vue
 *   // La isla recibe `lang` como prop desde la sección/widget Astro padre.
 *   // No importa utils.ts directamente — el prop es suficiente.
 *   const props = defineProps<{ lang: 'es' | 'en' }>();
 *   const label = computed(() => props.lang === 'es' ? 'Buscar...' : 'Search...');
 */

import es from './es';
import en from './en';

// ── Tipos ─────────────────────────────────────────────────────────────────────

/** Idiomas soportados por el portal. */
export type Lang = 'es' | 'en';

/** Lista de todos los idiomas disponibles. Usada en getStaticPaths. */
export const LANGS: Lang[] = ['es', 'en'];

/** Idioma por defecto del sitio. */
export const DEFAULT_LANG: Lang = 'es';

// ── Diccionarios ──────────────────────────────────────────────────────────────

const translations: Record<Lang, Record<string, string>> = { es, en };

// ── Funciones helper ──────────────────────────────────────────────────────────

/**
 * Extrae el idioma activo desde la URL de la página actual.
 *
 * La URL del portal sigue el patrón /[lang]/ruta/subruta.
 * Ej: /es/productos/banca-personal → 'es'
 *     /en/products                 → 'en'
 *
 * Si el segmento no es un idioma válido (ej: la raíz /), devuelve DEFAULT_LANG.
 *
 * @param url  El objeto URL de Astro.url
 */
export function getLangFromUrl(url: URL): Lang {
  const [, lang] = url.pathname.split('/');
  if (lang && LANGS.includes(lang as Lang)) {
    return lang as Lang;
  }
  return DEFAULT_LANG;
}

/**
 * Devuelve la función de traducción t() vinculada al idioma recibido.
 *
 * t() busca la clave en el diccionario del idioma activo.
 * Si no la encuentra, hace fallback al español para evitar strings vacíos.
 * Si tampoco existe en español, devuelve la propia clave como último recurso
 * — esto es útil durante el desarrollo para detectar keys faltantes.
 *
 * @param lang  El idioma activo ('es' | 'en')
 *
 * @ejemplo
 *   const t = useTranslations('en');
 *   t('nav.products')  // → 'Products & Services'
 *   t('nav.missing')   // → 'nav.missing'  (fallback visible — indica key faltante)
 */
export function useTranslations(lang: Lang) {
  return function t(key: string): string {
    const value = translations[lang][key];
    if (value !== undefined) return value;

    // Fallback al español si la clave no existe en el idioma solicitado
    const fallback = translations[DEFAULT_LANG][key];
    if (fallback !== undefined) return fallback;

    // Último recurso: devuelve la propia clave (facilita detectar strings faltantes)
    return key;
  };
}

/**
 * Construye la URL del mismo contenido en el idioma alternativo.
 * Usada en ToggleLang.astro para el botón de cambio de idioma.
 *
 * /es/productos/banca-personal → /en/productos/banca-personal
 * /en/herramientas/mapa        → /es/herramientas/mapa
 *
 * Si la URL no tiene prefijo de idioma (ej: /), devuelve la URL del
 * idioma alternativo en la raíz.
 *
 * @param url        URL actual de la página
 * @param targetLang Idioma al que se quiere cambiar
 */
export function getAlternateLangUrl(url: URL, targetLang: Lang): string {
  const parts = url.pathname.split('/').filter(Boolean);

  if (parts.length > 0 && LANGS.includes(parts[0] as Lang)) {
    // Sustituye el segmento de idioma
    parts[0] = targetLang;
    return '/' + parts.join('/');
  }

  // Sin prefijo de idioma — apunta a la raíz del idioma alternativo
  return `/${targetLang}`;
}

/**
 * Aplica el fallback de campo traducido de PocketBase.
 *
 * Patrón estándar para todos los campos _en del proyecto:
 *   - Si lang es 'es', siempre devuelve el valor base.
 *   - Si lang es 'en', devuelve el valor en inglés si existe y no está vacío,
 *     o el valor base en español como fallback.
 *
 * @ejemplo
 *   const nombre = translateField(lang, producto.nombre, producto.nombre_en);
 *
 * @param lang      Idioma activo
 * @param base      Valor en español (siempre presente)
 * @param translated Valor en inglés (puede estar vacío o undefined)
 */
export function translateField(
  lang: Lang,
  base: string,
  translated?: string | null
): string {
  if (lang === 'es') return base;
  return translated?.trim() ? translated.trim() : base;
}
