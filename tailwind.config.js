/**
 * @archivo  tailwind.config.js
 *
 * @descripcion
 *   Configuración de Tailwind CSS — portal BPA Santiago de Cuba.
 *
 *   primary / secondary / accent apuntan a variables CSS de CustomStyles.astro.
 *   El sistema dual (verde claro / ámbar oscuro) funciona automáticamente
 *   en cualquier componente que use bg-primary, text-primary, border-primary.
 *
 *   bpa-alt   → fondo de sección alternada (var CSS, se adapta al modo oscuro)
 *   bpa.N     → escala tonal fija del verde institucional para uso explícito
 */

import defaultTheme from 'tailwindcss/defaultTheme';
import plugin from 'tailwindcss/plugin';
import typographyPlugin from '@tailwindcss/typography';

export default {
  content: ['./src/**/*.{astro,html,js,jsx,json,md,mdx,svelte,ts,tsx,vue}'],

  theme: {
    extend: {
      colors: {
        /* Semánticos — apuntan a variables CSS de CustomStyles */
        primary:   'var(--aw-color-primary)',
        secondary: 'var(--aw-color-secondary)',
        accent:    'var(--aw-color-accent)',
        default:   'var(--aw-color-text-default)',
        muted:     'var(--aw-color-text-muted)',

        /* Fondo de sección alternada — uso: bg-bpa-alt */
        /* Claro: #F4FBF7 verde menta · Oscuro: #091810 verde muy oscuro */
        'bpa-alt': 'var(--bpa-bg-alt)',

        /* Escala tonal verde BPA — uso: bg-bpa-50, text-bpa-600, etc. */
        /* Nota: escala fija siempre verde, independiente del modo actual. */
        bpa: {
          50:  '#E8F5EE',   /* Fondos muy suaves, hover suave de íconos    */
          100: '#C8E6D5',   /* Bordes suaves, fondos de badge              */
          200: '#86C7A5',   /* Íconos suaves, separadores                  */
          400: '#009150',   /* Acento / hover / estados activos            */
          600: '#006A3A',   /* ★ Verde primario institucional BPA          */
          800: '#004424',   /* Texto sobre fondos claros, footer           */
          950: '#0D1F15',   /* Verde noche (color real de la tarjeta)      */
        },
      },

      fontFamily: {
        sans:    ['var(--aw-font-sans, ui-sans-serif)',    ...defaultTheme.fontFamily.sans],
        serif:   ['var(--aw-font-serif, ui-serif)',        ...defaultTheme.fontFamily.serif],
        heading: ['var(--aw-font-heading, ui-sans-serif)', ...defaultTheme.fontFamily.sans],
      },

      animation: {
        fade: 'fadeInUp 1s both',
      },

      keyframes: {
        fadeInUp: {
          '0%':   { opacity: 0, transform: 'translateY(2rem)' },
          '100%': { opacity: 1, transform: 'translateY(0)' },
        },
      },
    },
  },

  plugins: [
    typographyPlugin,
    plugin(({ addVariant }) => {
      addVariant('intersect', '&:not([no-intersect])');
    }),
  ],

  darkMode: 'class',
};
