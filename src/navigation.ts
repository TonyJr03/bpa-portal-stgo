import { getPermalink } from './utils/permalinks';

export const headerData = {
  links: [
    {
      text: 'Productos y Servicios',
      links: [
        {
          text: 'Categorias',
          href: getPermalink('/categorias'),
        },
        {
          text: 'Trámites',
          href: getPermalink('/tramites'),
        },
        {
          text: 'Otros Servicios',
          href: getPermalink('/otros-servicios'),
        },
      ],
    },
    {
      text: 'Sobre Nosotros',
      links: [
        {
          text: 'Historia',
          href: getPermalink('/historia'),
        },
        {
          text: 'Misión',
          href: getPermalink('/mision'),
        },
        {
          text: 'Visión',
          href: getPermalink('/vision'),
        },
        {
          text: 'Dirección Provincial',
          href: getPermalink('/direccion-provincial'),
        },
        {
          text: 'Subdirección Comercial',
          href: getPermalink('/subdireccion-comercial'),
        },
        {
          text: 'Oficina de Comunicaciones',
          href: getPermalink('/oficina-comunicaciones'),
        },
      ],
    },
    {
      text: 'Herramientas',
      links: [
        {
          text: 'Calendario',
          href: getPermalink('/calendario'),
        },
        {
          text: 'Calculadora',
          href: getPermalink('/calculadora'),
        },
        {
          text: 'Mapa',
          href: getPermalink('/mapa'),
        },
        {
          text: 'Contacto',
          href: getPermalink('/contacto'),
        },
        {
          text: 'Tasa de cambio',
          href: getPermalink('/tasa-de-cambio'),
        },
      ],
    },
  ],
  actions: [], // Eliminado el botón de "Download" ya que no corresponde al diseño del banco
};

export const footerData = {
  links: [
    {
      title: 'Productos y Servicios',
      links: [
        { text: 'Categorías', href: getPermalink('/categorias') },
        { text: 'Trámites', href: getPermalink('/tramites') },
        { text: 'Otros servicios', href: getPermalink('/otros-servicios') },
      ],
    },
    {
      title: 'Otros',
      links: [
        { text: 'Enzona', href: '#' },
        { text: 'BPA Nacional', href: '#' },
        { text: 'Cubadebate', href: '#' },
        { text: 'Periódico Granma', href: '#' },
      ],
    },
    {
      title: 'Herramientas',
      links: [
        { text: 'Opiniones', href: getPermalink('/opiniones') },
        { text: 'Calculadora', href: getPermalink('/calculadora') },
        { text: 'Calendario', href: getPermalink('/calendario') },
        { text: 'Tasas de cambio', href: getPermalink('/tasas-de-cambio') },
        { text: 'Mapa', href: getPermalink('/mapa') },
      ],
    },
    {
      title: 'Empresa',
      links: [
        { text: 'Sobre nosotros', href: getPermalink('/sobre-nosotros') },
        { text: 'Misión', href: getPermalink('/mision') },
      ],
    },
  ],
  secondaryLinks: [
    { text: 'Términos y Condiciones', href: getPermalink('/terminos') },
    { text: 'Política de Privacidad', href: getPermalink('/privacidad') },
  ],
  socialLinks: [
    { ariaLabel: 'X', icon: 'tabler:brand-x', href: '#' },
    { ariaLabel: 'Instagram', icon: 'tabler:brand-instagram', href: '#' },
    { ariaLabel: 'Facebook', icon: 'tabler:brand-facebook', href: '#' },
  ],
  footNote: `
    <span class="font-bold">BPA - Santiago de Cuba</span> · Todos los derechos reservados.
  `,
};
