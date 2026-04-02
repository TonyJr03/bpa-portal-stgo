/**
 * @archivo  src/navigation.ts
 *
 * @descripcion
 *   Datos de navegación del portal BPA.
 *   Exporta getHeaderData(lang) y getFooterData(lang) — funciones que
 *   devuelven los datos de navegación con textos traducidos y URLs
 *   correctas para el idioma recibido.
 *
 * @uso en PageLayout.astro
 *   import { getHeaderData, getFooterData } from '~/navigation';
 *   const lang       = getLangFromUrl(Astro.url);
 *   const headerData = getHeaderData(lang);
 *   const footerData = getFooterData(lang);
 */

import type { Lang }        from '~/i18n/utils';
import { useTranslations }  from '~/i18n/utils';
import { getPermalink }     from '~/utils/permalinks';

// ── Header ────────────────────────────────────────────────────────────────────

export function getHeaderData(lang: Lang) {
  const t = useTranslations(lang);
  const p = (slug: string) => getPermalink(slug, lang);

  return {
    links: [
      {
        text: t('nav.products'),
        href: p('productos'),
        links: [
          { text: t('nav.products.personal'),      href: p('productos/banca-personal')      },
          { text: t('nav.products.corporate'),     href: p('productos/banca-corporativa')   },
          { text: t('nav.products.electronic'),    href: p('productos/banca-electronica')   },
          { text: t('nav.products.international'), href: p('productos/banca-internacional') },
          { text: t('nav.products.other'),         href: p('productos/otros-servicios')     },
        ],
      },
      {
        text: t('nav.procedures'),
        href: p('tramites'),
      },
      {
        text: t('nav.about'),
        href: p('sobre-nosotros'),
        links: [
          { text: t('nav.about.mission'), href: p('sobre-nosotros/mision')      },
          { text: t('nav.about.vision'),  href: p('sobre-nosotros/vision')      },
          { text: t('nav.about.history'), href: p('sobre-nosotros/historia')    },
          { text: t('nav.about.network'), href: p('sobre-nosotros/nuestra-red') },
        ],
      },
      {
        text: t('nav.tools'),
        href: p('herramientas'),
        links: [
          { text: t('nav.tools.calculator'), href: p('herramientas/calculadora')     },
          { text: t('nav.tools.rates'),      href: p('herramientas/tasas-de-cambio') },
          { text: t('nav.tools.map'),        href: p('herramientas/mapa')            },
          { text: t('nav.tools.calendar'),   href: p('herramientas/calendario')      },
        ],
      },
    ],

    actions: [],
  };
}

// ── Footer ────────────────────────────────────────────────────────────────────

export function getFooterData(lang: Lang) {
  const t = useTranslations(lang);
  const p = (slug: string) => getPermalink(slug, lang);

  return {
    links: [
      {
        title: t('nav.footer.products'),
        links: [
          { text: t('nav.products.personal'),      href: p('productos/banca-personal')      },
          { text: t('nav.products.corporate'),     href: p('productos/banca-corporativa')   },
          { text: t('nav.products.electronic'),    href: p('productos/banca-electronica')   },
          { text: t('nav.products.international'), href: p('productos/banca-internacional') },
        ],
      },
      {
        title: t('nav.footer.about'),
        links: [
          { text: t('nav.about.mission'), href: p('sobre-nosotros/mision')      },
          { text: t('nav.about.vision'),  href: p('sobre-nosotros/vision')      },
          { text: t('nav.about.history'), href: p('sobre-nosotros/historia')    },
          { text: t('nav.about.network'), href: p('sobre-nosotros/nuestra-red') },
          { text: t('nav.footer.news'),   href: p('actualidad')                 },
        ],
      },
      {
        title: t('nav.footer.tools'),
        links: [
          { text: t('nav.tools.calculator'), href: p('herramientas/calculadora')     },
          { text: t('nav.tools.rates'),      href: p('herramientas/tasas-de-cambio') },
          { text: t('nav.tools.map'),        href: p('herramientas/mapa')            },
          { text: t('nav.tools.calendar'),   href: p('herramientas/calendario')      },
        ],
      },
    ],

    secondaryLinks: [
      { text: t('nav.terms'),   href: p('terminos')  },
      { text: t('nav.privacy'), href: p('privacidad') },
    ],

    socialLinks: [
      { ariaLabel: 'Facebook',  icon: 'tabler:brand-facebook',  href: '#' },
      { ariaLabel: 'Instagram', icon: 'tabler:brand-instagram', href: '#' },
      { ariaLabel: 'Telegram',  icon: 'tabler:brand-telegram',  href: '#' },
      { ariaLabel: 'YouTube',   icon: 'tabler:brand-youtube',   href: '#' },
    ],

    footNote: `
      <span class="font-semibold">BPA — Banco Popular de Ahorro</span>
      · ${t('nav.footer.copyright')} ${new Date().getFullYear()}.
    `,
  };
}
