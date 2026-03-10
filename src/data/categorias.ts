/**
 * @archivo  src/data/categorias.ts
 *
 * @descripcion
 * Fuente de verdad única para las 5 categorías de Productos y Servicios del BPA.
 * Las categorías son estructura fija del sitio — no cambian sin intervención
 * técnica — por lo que se definen aquí en lugar de consultarlas en PocketBase.
 *
 * Importar en:
 *   - src/pages/productos/index.astro          (grid de categorías)
 *   - src/pages/productos/[categoria].astro     (getStaticPaths → 5 rutas)
 *   - src/pages/productos/[categoria]/[producto].astro  (getStaticPaths → rutas por categoría)
 *
 * Si en algún momento se requiere añadir o renombrar una categoría, este es
 * el único archivo que debe modificarse.
 */

export interface Categoria {
  /** Nombre visible al usuario. Se usa en HeroText, cards y taglines. */
  nombre: string;
  /** Identificador de URL. Debe coincidir con el valor del campo Select
   *  `categoria` en la colección `productos` de PocketBase. */
  slug: string;
  /** Descripción corta. Se usa como subtitle en HeroText de [categoria].astro
   *  y como description de cada card en index.astro. */
  descripcion: string;
  /** Nombre del icono Tabler SIN prefijo. Ej: "user-dollar".
   *  En el template se usa como `tabler:${cat.icono}`. */
  icono: string;
}

export const CATEGORIAS: Categoria[] = [
  {
    nombre:     'Banca Personal',
    slug:       'banca-personal',
    descripcion:'Depósitos, ahorros y créditos diseñados para personas naturales cubanas y extranjeras residentes en el país.',
    icono:      'user-dollar',
  },
  {
    nombre:     'Banca Corporativa',
    slug:       'banca-corporativa',
    descripcion:'Financiamientos, líneas de crédito y servicios especializados para entidades estatales, cooperativas, MiPymes y trabajadores por cuenta propia.',
    icono:      'building-factory-2',
  },
  {
    nombre:     'Banca Electrónica',
    slug:       'banca-electronica',
    descripcion:'Canales digitales y medios de pago para gestionar sus cuentas y realizar operaciones sin necesidad de acudir a la sucursal.',
    icono:      'device-mobile',
  },
  {
    nombre:     'Banca Internacional',
    slug:       'banca-internacional',
    descripcion:'Servicios para la recepción de transferencias monetarias desde el exterior y operaciones con tarjetas internacionales en Cuba.',
    icono:      'globe',
  },
  {
    nombre:     'Otros Servicios',
    slug:       'otros-servicios',
    descripcion:'Trámites vinculados a la Ley de la Vivienda, cobros por cuenta de terceros, cheques de gerencia y pagos a jubilados y beneficiarios.',
    icono:      'layout-grid',
  },
];
