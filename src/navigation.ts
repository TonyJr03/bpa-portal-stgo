import { getPermalink } from './utils/permalinks';

export const headerData = {
  links: [
    {
      text: 'Productos y Servicios',
      href: getPermalink('/productos'), 
      links: [
        {
          text: 'Banca Personal',
          href: getPermalink('/productos/banca-personal'),
        },
        {
          text: 'Banca Corporativa',
          href: getPermalink('/productos/banca-corporativa'),
        },
        {
          text: 'Banca Electrónica',
          href: getPermalink('/productos/banca-electronica'),
        },
        {
          text: 'Banca Internacional',
          href: getPermalink('/productos/banca-internacional'),
        },
        {
          text: 'Otros Servicios',
          href: getPermalink('/productos/otros-servicios'),
        },
      ],
    },

    {
      text: 'Trámites',
      href: getPermalink('/tramites'),
    },

    {
      text: 'Sobre Nosotros',
      href: getPermalink('/sobre-nosotros'),
      links: [
        {
          text: 'Misión',
          href: getPermalink('/sobre-nosotros/mision'),
        },
        {
          text: 'Visión',
          href: getPermalink('/sobre-nosotros/vision'),
        },
        {
          text: 'Historia',
          href: getPermalink('/sobre-nosotros/historia'),
        },
        {
          text: 'Directorio Institucional',
          href: getPermalink('/sobre-nosotros/directorio'),
        },
      ],
    },

    {
      text: 'Herramientas',
      href: getPermalink('/herramientas'),
      links: [
        {
          text: 'Calculadora Financiera',
          href: getPermalink('/herramientas/calculadora'),
        },
        {
          text: 'Tasa de Cambio',
          href: getPermalink('/herramientas/tasas-de-cambio'),
        },
        {
          text: 'Mapa Interactivo',
          href: getPermalink('/herramientas/mapa'),
        },
        {
          text: 'Calendario',
          href: getPermalink('/herramientas/calendario'),
        },
      ],
    },

    {
      text: 'Contáctenos',
      href: getPermalink('/contacto'),
    },
  ],

  actions: [],
};

export const footerData = {
  links: [
    {
      title: 'Productos y Servicios',
      links: [
        { text: 'Banca Personal',       href: getPermalink('/productos/banca-personal') },
        { text: 'Banca Corporativa',    href: getPermalink('/productos/banca-corporativa') },
        { text: 'Banca Electrónica',    href: getPermalink('/productos/banca-electronica') },
        { text: 'Banca Internacional',  href: getPermalink('/productos/banca-internacional') },
        { text: 'Otros Servicios',      href: getPermalink('/productos/otros-servicios') },
        { text: 'Trámites',             href: getPermalink('/tramites') },
      ],
    },

    {
      title: 'Sobre Nosotros',
      links: [
        { text: 'Misión',                  href: getPermalink('/sobre-nosotros/mision') },
        { text: 'Visión',                  href: getPermalink('/sobre-nosotros/vision') },
        { text: 'Historia',                href: getPermalink('/sobre-nosotros/historia') },
        { text: 'Directorio Institucional', href: getPermalink('/sobre-nosotros/directorio') },
      ],
    },

    {
      title: 'Herramientas',
      links: [
        { text: 'Calculadora Financiera', href: getPermalink('/herramientas/calculadora') },
        { text: 'Tasa de Cambio',         href: getPermalink('/herramientas/tasas-de-cambio') },
        { text: 'Mapa Interactivo',       href: getPermalink('/herramientas/mapa') },
        { text: 'Calendario',             href: getPermalink('/herramientas/calendario') },
        { text: 'Contáctenos',            href: getPermalink('/contacto') },
      ],
    },

    {
      title: 'En la Red',
      links: [
        { text: 'BPA Nacional',   href: 'http://www.bpa.cu' },
        { text: 'EnZona',         href: 'http://www.enzona.net' },
        { text: 'Transfermóvil',  href: 'http://www.transfermovil.cu' },
        { text: 'Cubadebate',     href: 'http://www.cubadebate.cu' },
        { text: 'Granma',         href: 'http://www.granma.cu' },
      ],
    },
  ],

  secondaryLinks: [
    { text: 'Términos y Condiciones', href: getPermalink('/terminos') },
    { text: 'Política de Privacidad', href: getPermalink('/privacidad') },
  ],

  socialLinks: [
    { ariaLabel: 'Facebook',  icon: 'tabler:brand-facebook',  href: '#' },
    { ariaLabel: 'Instagram', icon: 'tabler:brand-instagram', href: '#' },
    { ariaLabel: 'Telegram',  icon: 'tabler:brand-telegram',  href: '#' },
    { ariaLabel: 'YouTube',   icon: 'tabler:brand-youtube',   href: '#' },
  ],

  footNote: `
    <span class="font-semibold">BPA — Banco Popular de Ahorro</span> · Sucursal Provincial Santiago de Cuba · Todos los derechos reservados ${new Date().getFullYear()}.
  `,
};
