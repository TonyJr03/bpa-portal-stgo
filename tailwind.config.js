/**
 * @archivo  tailwind.config.js
 *
 * @descripcion
 *   Configuración de Tailwind CSS — portal BPA Santiago de Cuba.
 *
 *   Los tokens semánticos (primary, secondary, accent) apuntan a variables
 *   CSS de CustomStyles.astro. El sistema dual funciona automáticamente:
 *   en claro usan verde, en oscuro usan ámbar — sin tocar los componentes.
 *
 *   Escalas tonales fijas (no cambian entre modos):
 *
 *   bpa (verde) → bg-bpa-50 … bg-bpa-950
 *     Uso típico: fondos suaves, bordes, badges en modo claro.
 *     Ej: bg-bpa-100, text-bpa-600, border-bpa-200
 *
 *   bpa-amber → bg-bpa-amber-50 … bg-bpa-amber-950
 *     Uso típico: fondos, bordes, badges en modo oscuro o para accent.
 *     Ej: dark:bg-bpa-amber-950, dark:border-bpa-amber-800,
 *         dark:text-bpa-amber-200, bg-bpa-amber-100 (FAQs, tips)
 *
 *   bpa-alt → bg-bpa-alt
 *     Fondo de sección alternada. Se adapta automáticamente:
 *     Claro → #FFFFFF · Oscuro → rgba(255 255 255 / 4%)
 */

import defaultTheme from 'tailwindcss/defaultTheme';
import plugin from 'tailwindcss/plugin';
import typographyPlugin from '@tailwindcss/typography';

export default {
  content: ['./src/**/*.{astro,html,js,jsx,json,md,mdx,svelte,ts,tsx,vue}'],

  theme: {
    extend: {
      colors: {
        /* ── Tokens semánticos — apuntan a variables CSS de CustomStyles ── */
        /*    En claro: verdes. En oscuro: ámbar. Automático.               */
        primary: 'var(--aw-color-primary)',
        secondary: 'var(--aw-color-secondary)',
        accent: 'var(--aw-color-accent)',
        default: 'var(--aw-color-text-default)',
        muted: 'var(--aw-color-text-muted)',

        /* ── Fondo de sección alternada ─────────────────────────────────── */
        /*    Uso: bg-bpa-alt                                                */
        'bpa-alt': 'var(--bpa-bg-alt)',

        /* ── Escala tonal Verde BPA ──────────────────────────────────────── */
        /*    Fija — siempre verde, independiente del modo.                  */
        /*    Uso: bg-bpa-50, text-bpa-600, border-bpa-200, etc.            */
        bpa: {
          50: '#E8F5EE' /* Fondos muy suaves, hover suave de íconos     */,
          100: '#C8E6D5' /* Bordes suaves, fondos de badge               */,
          200: '#86C7A5' /* Íconos suaves, separadores                   */,
          400: '#009150' /* Acento / hover / estados activos             */,
          600: '#006A3A' /* ★ Verde primario institucional BPA           */,
          800: '#004424' /* Texto sobre fondos claros, footer            */,
          950: '#0D1F15' /* Verde noche (fondo dark mode real)           */,
        },

        /* ── Escala tonal Ámbar BPA ──────────────────────────────────────── */
        /*    Fija — siempre ámbar, independiente del modo.                  */
        /*    Espejo del verde pero en el tono del logo dorado del BPA.      */
        /*    Uso: dark:bg-bpa-amber-950, dark:border-bpa-amber-800,        */
        /*         bg-bpa-amber-100 (FAQs, tips, bordes premium)            */
        'bpa-amber': {
          50: '#FDF8E8' /* Fondo crema muy suave — tips, FAQs           */,
          100: '#F5E4A0' /* Dorado claro — badge sobre fondo oscuro      */,
          200: '#E8C84A' /* Dorado medio — separadores, divisores        */,
          400: '#C49A28' /* Dorado cálido — hover sobre fondo ámbar      */,
          600: '#B8860B' /* ★ Ámbar primario oscuro (dark goldenrod)     */,
          800: '#8B6508' /* Ámbar hover / secondary en dark mode         */,
          950: '#3D2A03' /* Ámbar casi negro — fondos profundos dark     */,
        },
      },

      fontFamily: {
        sans: ['var(--aw-font-sans, ui-sans-serif)', ...defaultTheme.fontFamily.sans],
        serif: ['var(--aw-font-serif, ui-serif)', ...defaultTheme.fontFamily.serif],
        heading: ['var(--aw-font-heading, ui-sans-serif)', ...defaultTheme.fontFamily.sans],
      },

      animation: {
        fade: 'fadeInUp 1s both',
      },

      keyframes: {
        fadeInUp: {
          '0%': { opacity: 0, transform: 'translateY(2rem)' },
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
