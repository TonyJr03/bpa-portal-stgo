<script setup lang="ts">
/**
 * @componente  src/components/vue/MapaSucursales.vue
 * @directiva   client:load
 *
 * @descripcion
 *   Mapa v2 — Leaflet con tiles offline servidos desde /tiles/{z}/{x}/{y}.png
 *   (generados con descargar-tiles.mjs, almacenados en public/tiles/).
 *
 *   Cambios respecto al Mapa v1:
 *   · El SVG esquemático de municipios se reemplaza por un mapa real con Leaflet.
 *   · Los puntos con latitud/longitud se muestran como marcadores en el mapa.
 *   · El filtro de municipio pasa a ser un <select> en el panel lateral.
 *   · El panel muestra todos los puntos por defecto (sin requerir clic previo).
 *   · Conexión bidireccional: clic en marcador → expande tarjeta en el panel,
 *     clic en tarjeta → el mapa vuela a la ubicación del punto.
 *
 *   Panel lateral conservado íntegro del Mapa v1:
 *   búsqueda insensible a tildes, filtros por tipo con conteo, tarjetas
 *   expandibles con dirección, teléfono, horario, nota y disponibilidad ATM.
 *
 * @coleccion   puntos_de_atencion
 *   nombre           Text
 *   tipo             Select  'S' | 'AN' | 'CA' | 'CAE' | 'AT'
 *   codigo_sucursal  Text
 *   municipio        Select  slug del municipio
 *   direccion        Text
 *   telefono         Text
 *   horario          Text
 *   nota             Text
 *   latitud          Number  ← requerido para aparecer en el mapa
 *   longitud         Number  ← requerido para aparecer en el mapa
 *   orden            Number
 *   publicado        Bool
 *
 * @coleccion   disponibilidad_at
 *   cajero     Relation → puntos_de_atencion
 *   billetes   Select multi
 *   estado     Select → 'operativo' | 'fuera_de_servicio' | 'sin_efectivo'
 *   updated    Date
 *
 * @tiles  public/tiles/{z}/{x}/{y}.png  (zoom 10–15, provincia Santiago de Cuba)
 *         Generar con: node descargar-tiles.mjs (raíz del proyecto)
 */

import { ref, computed, onMounted, onUnmounted, watch } from 'vue';
import { pb } from '~/lib/pocketbase';
import type { Map as LeafletMap, LayerGroup, Marker, DivIcon } from 'leaflet';

// ── Tipos ─────────────────────────────────────────────────────────────────────
type TipoPunto = 'S' | 'AN' | 'CA' | 'CAE' | 'AT';
type EstadoAT  = 'operativo' | 'fuera_de_servicio' | 'sin_efectivo';

interface PuntoAtencion {
  id:              string;
  nombre:          string;
  tipo:            TipoPunto;
  codigo_sucursal: string;
  municipio:       string;
  direccion:       string;
  telefono:        string;
  horario:         string;
  nota:            string;
  latitud:         number;
  longitud:        number;
  orden:           number;
}

interface DisponibilidadAT {
  id:       string;
  cajero:   string;
  billetes: string[];
  estado:   EstadoAT;
  updated:  string;
}

// ── Configuración visual por tipo ─────────────────────────────────────────────
const CONFIG_TIPO: Record<TipoPunto, {
  label:       string;
  badgeBg:     string;
  badgeText:   string;
  color:       string;   // color del marcador en el mapa
  borderColor: string;
  cardBg:      string;   // fondo suave de la tarjeta (abierta y cerrada)
  cardHover:   string;   // fondo hover del botón cabecera
  cardActive:  string;   // fondo fijo cuando la tarjeta está abierta
}> = {
  S: {
    label:       'Sucursal',
    badgeBg:     'bg-emerald-100 dark:bg-emerald-900/40',
    badgeText:   'text-emerald-700 dark:text-emerald-300',
    color:       '#065f46',
    borderColor: 'border-emerald-300 dark:border-emerald-700',
    cardBg:      'bg-emerald-50/70 dark:bg-emerald-900/10',
    cardHover:   'hover:bg-emerald-100/80 dark:hover:bg-emerald-900/25',
    cardActive:  'bg-emerald-100/80 dark:bg-emerald-900/25',
  },
  AN: {
    label:       'Área de Negocio',
    badgeBg:     'bg-violet-100 dark:bg-violet-900/40',
    badgeText:   'text-violet-700 dark:text-violet-300',
    color:       '#5b21b6',
    borderColor: 'border-violet-300 dark:border-violet-700',
    cardBg:      'bg-violet-50/70 dark:bg-violet-900/10',
    cardHover:   'hover:bg-violet-100/80 dark:hover:bg-violet-900/25',
    cardActive:  'bg-violet-100/80 dark:bg-violet-900/25',
  },
  CA: {
    label:       'Caja de Ahorro',
    badgeBg:     'bg-blue-100 dark:bg-blue-900/40',
    badgeText:   'text-blue-700 dark:text-blue-300',
    color:       '#1d4ed8',
    borderColor: 'border-blue-300 dark:border-blue-700',
    cardBg:      'bg-blue-50/70 dark:bg-blue-900/10',
    cardHover:   'hover:bg-blue-100/80 dark:hover:bg-blue-900/25',
    cardActive:  'bg-blue-100/80 dark:bg-blue-900/25',
  },
  CAE: {
    label:       'Caja Ahorro Extendida',
    badgeBg:     'bg-sky-100 dark:bg-sky-900/40',
    badgeText:   'text-sky-700 dark:text-sky-300',
    color:       '#0284c7',
    borderColor: 'border-sky-300 dark:border-sky-700',
    cardBg:      'bg-sky-50/70 dark:bg-sky-900/10',
    cardHover:   'hover:bg-sky-100/80 dark:hover:bg-sky-900/25',
    cardActive:  'bg-sky-100/80 dark:bg-sky-900/25',
  },
  AT: {
    label:       'Cajero Automático',
    badgeBg:     'bg-amber-100 dark:bg-amber-900/40',
    badgeText:   'text-amber-700 dark:text-amber-300',
    color:       '#b45309',
    borderColor: 'border-amber-300 dark:border-amber-700',
    cardBg:      'bg-amber-50/70 dark:bg-amber-900/10',
    cardHover:   'hover:bg-amber-100/80 dark:hover:bg-amber-900/25',
    cardActive:  'bg-amber-100/80 dark:bg-amber-900/25',
  },
};

const CONFIG_ESTADO: Record<EstadoAT, { label: string; dot: string; text: string }> = {
  operativo:         { label: 'Operativo',         dot: 'bg-green-500',  text: 'text-green-700 dark:text-green-400'   },
  fuera_de_servicio: { label: 'Fuera de servicio', dot: 'bg-red-500',    text: 'text-red-700 dark:text-red-400'       },
  sin_efectivo:      { label: 'Sin efectivo',      dot: 'bg-yellow-400', text: 'text-yellow-700 dark:text-yellow-400' },
};

const NOMBRE_MUNICIPIO: Record<string, string> = {
  'contramaestre':    'Contramaestre',
  'san-luis':         'San Luis',
  'segundo-frente':   'Segundo Frente',
  'songo-la-maya':    'Songo - La Maya',
  'santiago-de-cuba': 'Santiago de Cuba',
  'palma-soriano':    'Palma Soriano',
  'tercer-frente':    'Tercer Frente',
  'mella':            'Mella',
  'guama':            'Guamá',
};

// Centro geográfico aproximado de cada municipio para el flyTo del select
const CENTRO_MUNICIPIO: Record<string, [number, number]> = {
  'santiago-de-cuba': [20.0200, -75.8200],
  'contramaestre':    [20.3000, -76.2400],
  'san-luis':         [20.1800, -75.8500],
  'segundo-frente':   [20.3500, -76.0000],
  'songo-la-maya':    [20.1700, -75.6500],
  'palma-soriano':    [20.2000, -75.9800],
  'tercer-frente':    [20.0500, -76.1000],
  'mella':            [20.0800, -75.5500],
  'guama':            [20.0500, -76.5000],
};

// Configuración del mapa
const CENTRO_PROVINCIA: [number, number] = [20.10, -76.00];
const ZOOM_INICIAL    = 10;
const ZOOM_MUNICIPIO  = 13;
const ZOOM_PUNTO      = 16;  // máximo zoom disponible en los tiles descargados

const ORDEN_TIPOS: TipoPunto[] = ['S', 'AN', 'CA', 'CAE', 'AT'];

// Letra identificadora del tipo para el marcador del mapa
const LETRA_TIPO: Record<TipoPunto, string> = {
  S: 'S', AN: 'AN', CA: 'CA', CAE: 'CE', AT: 'AT',
};

// ── Instancia de Leaflet — asignada en inicializarMapa() ─────────────────────
// Variable de módulo para evitar problemas de tipos con @types/leaflet,
// que no exporta 'default' y hace inválido typeof import('leaflet').default
// en expresiones de tipo.
let L: typeof import('leaflet') | null = null;

// ── Estado reactivo ───────────────────────────────────────────────────────────
const mapContainer     = ref<HTMLDivElement | null>(null);
const expandidoId      = ref<string | null>(null);
const cargando         = ref(true);
const errorDB          = ref(false);
const todos            = ref<PuntoAtencion[]>([]);
const disponibilidades = ref<DisponibilidadAT[]>([]);
// Cadena vacía = "todos los municipios" (facilita el binding con <select>)
const municipioActivo  = ref<string>('');
const busqueda         = ref('');
const filtrosTipo      = ref<Set<TipoPunto>>(new Set());

// Referencias a Leaflet — no reactivas, Leaflet gestiona su propio estado interno
let mapa:        LeafletMap | null = null;
let capaMarkers: LayerGroup | null = null;
// id del punto → marcador, para poder centrar el mapa desde el panel
const marcadoresRef = new Map<string, Marker>();

// ── Computed ──────────────────────────────────────────────────────────────────
const disponibilidadMap = computed((): Map<string, DisponibilidadAT> => {
  const map = new Map<string, DisponibilidadAT>();
  for (const d of disponibilidades.value) map.set(d.cajero, d);
  return map;
});

// Lista de slugs de municipios que tienen al menos un punto, ordenados alfabéticamente
const municipiosDisponibles = computed((): string[] => {
  const slugs = [...new Set(todos.value.map(p => p.municipio).filter(Boolean))];
  return slugs.sort((a, b) =>
    (NOMBRE_MUNICIPIO[a] ?? a).localeCompare(NOMBRE_MUNICIPIO[b] ?? b)
  );
});

// Lista de puntos aplicando los tres filtros activos
const puntosFiltrados = computed((): PuntoAtencion[] => {
  let lista = municipioActivo.value
    ? todos.value.filter(p => p.municipio === municipioActivo.value)
    : todos.value;
  const q = normalizar(busqueda.value.trim());
  if (q) lista = lista.filter(p =>
    normalizar(p.nombre).includes(q) || normalizar(p.direccion).includes(q)
  );
  if (filtrosTipo.value.size > 0) lista = lista.filter(p => filtrosTipo.value.has(p.tipo));
  return lista;
});

// Solo los puntos del filtrado que tienen coordenadas válidas — estos van al mapa
const puntosConCoordenadas = computed((): PuntoAtencion[] =>
  puntosFiltrados.value.filter(p => p.latitud && p.longitud)
);

const puntosAgrupados = computed((): { tipo: TipoPunto; items: PuntoAtencion[] }[] => {
  const grupos: { tipo: TipoPunto; items: PuntoAtencion[] }[] = [];
  for (const tipo of ORDEN_TIPOS) {
    const items = puntosFiltrados.value.filter(p => p.tipo === tipo);
    if (items.length > 0) grupos.push({ tipo, items });
  }
  return grupos;
});

// Conteo por tipo para los botones de filtro — sobre la base del municipio activo
const conteoTipo = computed((): Partial<Record<TipoPunto, number>> => {
  const base = municipioActivo.value
    ? todos.value.filter(p => p.municipio === municipioActivo.value)
    : todos.value;
  const conteo: Partial<Record<TipoPunto, number>> = {};
  for (const p of base) {
    conteo[p.tipo] = (conteo[p.tipo] ?? 0) + 1;
  }
  return conteo;
});

// ── Helpers ───────────────────────────────────────────────────────────────────
function normalizar(texto: string): string {
  return texto.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function toggleFiltroTipo(tipo: TipoPunto) {
  const nuevo = new Set(filtrosTipo.value);
  if (nuevo.has(tipo)) nuevo.delete(tipo);
  else nuevo.add(tipo);
  filtrosTipo.value = nuevo;
}

function limpiarFiltros() {
  busqueda.value    = '';
  filtrosTipo.value = new Set();
}

function toggleExpansion(id: string) {
  expandidoId.value = expandidoId.value === id ? null : id;
}

function formatearFecha(iso: string): string {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('es-CU', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

// ── Leaflet — icono SVG personalizado por tipo ────────────────────────────────
// Marcador tipo "pin de mapa" con la letra del tipo dentro.
// destacado=true aumenta el tamaño brevemente al seleccionarlo desde el panel.
function crearIcono(tipo: TipoPunto, destacado = false): DivIcon {
  if (!L) throw new Error('[MapaSucursales] Leaflet no está inicializado');

  const color  = CONFIG_TIPO[tipo].color;
  const size   = destacado ? 40 : 30;
  const border = destacado ? 3  : 2;
  const fs     = destacado ? 11 : 8;

  const html = `
    <div style="
      width:${size}px;
      height:${size}px;
      background:${color};
      border:${border}px solid white;
      border-radius:50% 50% 50% 0;
      transform:rotate(-45deg);
      box-shadow:0 2px 8px rgba(0,0,0,0.4);
      display:flex;
      align-items:center;
      justify-content:center;
    ">
      <span style="
        transform:rotate(45deg);
        color:white;
        font-size:${fs}px;
        font-weight:700;
        font-family:system-ui,sans-serif;
        letter-spacing:-0.5px;
        line-height:1;
        text-shadow:0 1px 2px rgba(0,0,0,0.3);
      ">${LETRA_TIPO[tipo]}</span>
    </div>`;

  return L.divIcon({
    html,
    className:   '',
    iconSize:    [size, size],
    iconAnchor:  [size / 2, size],
    popupAnchor: [0, -size],
  });
}

// ── Leaflet — inicializar el mapa ─────────────────────────────────────────────
async function inicializarMapa() {
  if (!mapContainer.value) return;

  // Importación dinámica para evitar el error "window is not defined" en SSR de Astro.
  // Se asigna a la variable de módulo L para que crearIcono() pueda usarla de forma síncrona.
  L = (await import('leaflet')).default;

  // Límites geográficos de los tiles descargados (bbox de la provincia)
  // maxBoundsViscosity:1 impide completamente desplazarse fuera de esta área
  const limiteProvincia = L.latLngBounds(
    L.latLng(19.70, -77.25),  // SW
    L.latLng(20.65, -75.20),  // NE
  );

  mapa = L.map(mapContainer.value, {
    center:             CENTRO_PROVINCIA,
    zoom:               ZOOM_INICIAL,
    zoomControl:        true,
    minZoom:            10,
    maxZoom:            16,
    maxBounds:          limiteProvincia,
    maxBoundsViscosity: 1.0,  // 1.0 = límite completamente rígido (no permite arrastrar fuera)
  });

  // Capa de tiles offline — servidos desde public/tiles/ → /tiles/{z}/{x}/{y}.png
  L.tileLayer('/tiles/{z}/{x}/{y}.png', {
    minZoom:     10,
    maxZoom:     16,  // actualizar a 16 tras descargar ese nivel con descargar-tiles.mjs
    attribution: '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors',
    // Tile vacío transparente si el archivo no existe (evita errores 404 en consola)
    errorTileUrl: 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
  }).addTo(mapa);

  // Capa de marcadores (se limpia y repopula al cambiar los filtros)
  capaMarkers = L.layerGroup().addTo(mapa);

  // Dibujar marcadores con los datos ya cargados
  actualizarMarcadores();
}

// ── Leaflet — repopular marcadores según puntosConCoordenadas ─────────────────
async function actualizarMarcadores() {
  if (!mapa || !capaMarkers || !L) return;

  capaMarkers.clearLayers();
  marcadoresRef.clear();

  for (const punto of puntosConCoordenadas.value) {
    const marcador = L
      .marker([punto.latitud, punto.longitud], { icon: crearIcono(punto.tipo) })
      .addTo(capaMarkers);

    // Clic en el marcador → expande la tarjeta del panel y hace scroll hasta ella
    marcador.on('click', () => {
      expandidoId.value = punto.id;
      scrollTarjeta(punto.id);
    });

    marcadoresRef.set(punto.id, marcador);
  }
}

// ── Panel → Mapa: volar al punto al hacer clic en la cabecera de la tarjeta ───
// Solo vuela cuando se ABRE la tarjeta; al cerrarla no mueve el mapa.
function volarAPunto(punto: PuntoAtencion) {
  const seEstaAbriendo = expandidoId.value !== punto.id;
  toggleExpansion(punto.id);
  if (!seEstaAbriendo || !mapa || !punto.latitud || !punto.longitud) return;
  mapa.flyTo([punto.latitud, punto.longitud], ZOOM_PUNTO, { duration: 0.8 });
  // Destacar brevemente el marcador seleccionado
  const marcador = marcadoresRef.get(punto.id);
  if (marcador) {
    marcador.setIcon(crearIcono(punto.tipo, true));
    setTimeout(() => marcador.setIcon(crearIcono(punto.tipo)), 2000);
  }
}

// ── Select de municipio → mapa vuela al centro del municipio ──────────────────
function alCambiarMunicipio() {
  busqueda.value    = '';
  filtrosTipo.value = new Set();
  expandidoId.value = null;

  if (!mapa) return;
  if (municipioActivo.value && CENTRO_MUNICIPIO[municipioActivo.value]) {
    mapa.flyTo(CENTRO_MUNICIPIO[municipioActivo.value], ZOOM_MUNICIPIO, { duration: 0.8 });
  } else {
    // "Todos los municipios" → volver a la vista general de la provincia
    mapa.flyTo(CENTRO_PROVINCIA, ZOOM_INICIAL, { duration: 0.8 });
  }
}

// ── Scroll automático a una tarjeta dentro del panel ─────────────────────────
function scrollTarjeta(id: string) {
  setTimeout(() => {
    document.getElementById(`tarjeta-punto-${id}`)
      ?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, 100);
}

// ── Watcher — refrescar marcadores cuando cambian los filtros ─────────────────
watch(puntosConCoordenadas, () => actualizarMarcadores());

// ── Carga de datos ────────────────────────────────────────────────────────────
async function cargarDatos() {
  cargando.value = true;
  errorDB.value  = false;
  try {
    const [puntos, disp] = await Promise.all([
      pb.collection('puntos_de_atencion').getFullList<PuntoAtencion>({
        filter: 'publicado = true',
        sort:   'municipio,orden',
      }),
      pb.collection('disponibilidad_at').getFullList<DisponibilidadAT>({
        sort: '-updated',
      }),
    ]);
    todos.value            = puntos;
    disponibilidades.value = disp;
  } catch {
    errorDB.value = true;
  } finally {
    cargando.value = false;
  }
}

// ── Ciclo de vida ─────────────────────────────────────────────────────────────
onMounted(async () => {
  await cargarDatos();
  if (!errorDB.value) await inicializarMapa();
});

onUnmounted(() => {
  mapa?.remove();
  mapa = null;
});
</script>

<template>
  <div class="w-full">

    <!-- ── ESTADO: Cargando ──────────────────────────────────────────────── -->
    <div v-if="cargando"
      class="flex flex-col items-center justify-center gap-4 py-24 text-muted">
      <!-- tabler:loader-2 -->
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
        class="w-10 h-10 animate-spin text-primary">
        <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
        <path d="M12 3a9 9 0 1 0 9 9" />
      </svg>
      <p class="text-sm">Cargando puntos de atención…</p>
    </div>

    <!-- ── ESTADO: Error ─────────────────────────────────────────────────── -->
    <div v-else-if="errorDB"
      class="flex flex-col items-center justify-center gap-4 py-20 rounded-xl
             border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/30
             text-red-600 dark:text-red-400">
      <!-- tabler:alert-circle -->
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
        class="w-10 h-10">
        <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
        <path d="M3 12a9 9 0 1 0 18 0a9 9 0 0 0 -18 0" />
        <path d="M12 8v4" /><path d="M12 16h.01" />
      </svg>
      <p class="font-semibold text-sm">No se pudo cargar la información de oficinas.</p>
      <p class="text-xs text-red-500">Se perdió la conexión con el servidor.</p>
      <button @click="cargarDatos"
        class="inline-flex items-center gap-2 rounded-lg bg-red-600 hover:bg-red-700
              text-white text-sm font-medium px-4 py-2 transition-colors">
        <!-- tabler:refresh -->
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
          class="w-4 h-4">
          <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
          <path d="M20 11a8.1 8.1 0 0 0 -15.5 -2m-.5 -4v4h4" />
          <path d="M4 13a8.1 8.1 0 0 0 15.5 2m.5 4v-4h-4" />
        </svg>
        Reintentar
      </button>
    </div>

    <!-- ── CONTENIDO PRINCIPAL ───────────────────────────────────────────── -->
    <template v-else>

      <!-- Leyenda de tipos -->
      <div class="flex flex-wrap gap-3 mb-5">
        <div v-for="tipo in (['S','AN','CA','CAE','AT'] as const)" :key="tipo"
          class="flex items-center gap-1.5 text-xs font-medium text-muted">
          <span class="inline-block w-3 h-3 rounded-sm"
            :style="{ backgroundColor: CONFIG_TIPO[tipo].color }"></span>
          {{ tipo }} — {{ CONFIG_TIPO[tipo].label }}
        </div>
      </div>

      <!-- Layout bicolumna: Mapa Leaflet | Panel
           En desktop la altura total es la ventana menos header (4.5rem) +
           padding WidgetWrapper (5rem) + leyenda (~2rem) + breathing room = 13rem. -->
      <div class="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-6 lg:h-[calc(100vh-13rem)]">

        <!-- ── Columna izquierda: Mapa Leaflet ───────────────────────────── -->
        <!-- La clase mapa-wrapper aplica isolation:isolate, que confina los
             z-index internos de Leaflet (400+) dentro de este contenedor.
             Esto impide que el mapa tape el menú hamburguesa en móvil y que
             los panes de Leaflet bloqueen el foco/hover de los inputs del panel. -->
        <div class="rounded-2xl border border-bpa-200 dark:border-bpa-amber-800
                    overflow-hidden min-h-[420px] lg:h-full mapa-wrapper">
          <!-- h-full funciona porque el padre del grid tiene altura definida en lg -->
          <div ref="mapContainer" class="w-full h-[420px] lg:h-full"></div>
        </div>

        <!-- ── Columna derecha: Panel de oficinas ────────────────────────── -->
        <!-- overflow-hidden eliminado: recortaba el focus:ring (box-shadow) de los inputs -->
        <div class="flex flex-col gap-4 lg:h-full min-h-[400px]">

          <!-- Selector de municipio + Búsqueda
               En escritorio: misma fila mitad/mitad. En móvil: apilados. -->
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">

            <!-- Selector de municipio -->
            <div class="relative">
              <select
                v-model="municipioActivo"
                @change="alCambiarMunicipio"
                class="w-full appearance-none rounded-lg border border-bpa-200
                       dark:border-bpa-amber-800 bg-white dark:bg-bpa-950/80
                       text-default dark:text-default px-4 pr-9 py-2.5 text-sm
                       focus:outline-none focus:ring-2 focus:ring-primary transition">
                <option value="">Todos los municipios</option>
                <option v-for="slug in municipiosDisponibles" :key="slug" :value="slug">
                  {{ NOMBRE_MUNICIPIO[slug] ?? slug }}
                </option>
              </select>
              <!-- Flecha decorativa -->
              <span class="pointer-events-none absolute inset-y-0 right-3 flex items-center text-muted">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"
                  class="w-4 h-4">
                  <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
                  <path d="M6 9l6 6l6 -6" />
                </svg>
              </span>
            </div>

            <!-- Búsqueda -->
            <div class="relative">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
                class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted pointer-events-none">
                <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
                <path d="M10 10m-7 0a7 7 0 1 0 14 0a7 7 0 1 0 -14 0" />
                <path d="M21 21l-6 -6" />
              </svg>
              <!-- :value + @input en lugar de v-model para que el teclado virtual
                   de Android actualice en cada tecla y no espere al fin de composición -->
              <input
                :value="busqueda"
                @input="busqueda = ($event.target as HTMLInputElement).value"
                type="text"
                placeholder="Buscar…"
                class="w-full pl-9 pr-9 py-2.5 text-sm rounded-lg border border-bpa-200
                      dark:border-bpa-amber-800 bg-white dark:bg-bpa-950/80
                      text-default dark:text-default placeholder:text-muted
                      focus:outline-none focus:ring-2 focus:ring-primary transition" />
              <button v-if="busqueda" @click="busqueda = ''"
                class="absolute right-3 top-1/2 -translate-y-1/2 text-muted
                      hover:text-default dark:hover:text-default transition-colors">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"
                  class="w-3.5 h-3.5">
                  <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
                  <path d="M18 6l-12 12" /><path d="M6 6l12 12" />
                </svg>
              </button>
            </div>

          </div><!-- fin grid inputs -->

          <!-- Filtros por tipo -->
          <div class="flex flex-wrap gap-1.5">
            <button v-for="tipo in (['S','AN','CA','CAE','AT'] as const)" :key="tipo"
              v-show="(conteoTipo[tipo] ?? 0) > 0"
              @click="toggleFiltroTipo(tipo)"
              class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold border transition-colors"
              :class="filtrosTipo.size === 0 || filtrosTipo.has(tipo)
                ? [CONFIG_TIPO[tipo].badgeBg, CONFIG_TIPO[tipo].badgeText, CONFIG_TIPO[tipo].borderColor]
                : 'bg-white dark:bg-bpa-950/60 text-muted border-bpa-100 dark:border-bpa-800'">
              {{ tipo }}
              <span class="font-normal opacity-70">{{ conteoTipo[tipo] }}</span>
            </button>
            <button v-if="filtrosTipo.size > 0 || busqueda"
              @click="limpiarFiltros"
              class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium
                    text-muted border border-muted dark:border-muted
                    bg-white dark:bg-bpa-950/60 hover:bg-bpa-50 dark:hover:bg-bpa-800/30 transition-colors">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"
                class="w-3 h-3">
                <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
                <path d="M18 6l-12 12" /><path d="M6 6l12 12" />
              </svg>
              Limpiar
            </button>
          </div>

          <!-- Contador de resultados -->
          <p class="text-xs text-muted">
            <span class="font-semibold text-default dark:text-default">
              {{ puntosFiltrados.length }}
            </span>
            punto{{ puntosFiltrados.length !== 1 ? 's' : '' }}
            encontrado{{ puntosFiltrados.length !== 1 ? 's' : '' }}
            <span v-if="puntosConCoordenadas.length < puntosFiltrados.length"
              class="ml-1 text-amber-600 dark:text-amber-400">
              ({{ puntosConCoordenadas.length }} con ubicación GPS)
            </span>
          </p>

          <!-- Sin resultados -->
          <div v-if="puntosFiltrados.length === 0"
            class="text-center py-10 text-sm text-muted italic">
            No se encontraron oficinas con los filtros actuales.
          </div>

          <!-- Lista agrupada con scroll -->
          <div v-else
            class="flex-1 overflow-y-auto space-y-5 pr-1 min-h-0
                   [&::-webkit-scrollbar]:w-1.5
                   [&::-webkit-scrollbar-track]:rounded-full
                   [&::-webkit-scrollbar-track]:bg-bpa-50
                   dark:[&::-webkit-scrollbar-track]:bg-bpa-amber-800/30
                   [&::-webkit-scrollbar-thumb]:rounded-full
                   [&::-webkit-scrollbar-thumb]:bg-bpa-200
                   dark:[&::-webkit-scrollbar-thumb]:bg-bpa-amber-600
                   hover:[&::-webkit-scrollbar-thumb]:bg-bpa-400
                   dark:hover:[&::-webkit-scrollbar-thumb]:bg-bpa-amber-800">

            <div v-for="grupo in puntosAgrupados" :key="grupo.tipo">

              <!-- Separador de grupo -->
              <div class="flex items-center gap-2 mb-2">
                <span class="text-[11px] font-bold uppercase tracking-widest px-2 py-0.5 rounded"
                  :class="[CONFIG_TIPO[grupo.tipo].badgeBg, CONFIG_TIPO[grupo.tipo].badgeText]">
                  {{ CONFIG_TIPO[grupo.tipo].label }}
                </span>
                <span class="flex-1 h-px bg-bpa-200 dark:bg-bpa-amber-800"></span>
              </div>

              <!-- Tarjetas del grupo -->
              <div class="space-y-2">
                <div v-for="punto in grupo.items" :key="punto.id"
                  :id="`tarjeta-punto-${punto.id}`"
                  class="rounded-xl border overflow-hidden transition-all"
                  :class="[
                    CONFIG_TIPO[punto.tipo].borderColor,
                    CONFIG_TIPO[punto.tipo].cardBg,
                    expandidoId === punto.id ? 'shadow-md' : 'hover:shadow-sm',
                  ]">

                  <!-- Cabecera tarjeta — clic vuela al punto en el mapa -->
                  <button @click="volarAPunto(punto)"
                    class="w-full flex items-center justify-between gap-2 px-3.5 py-3
                          text-left transition-colors"
                    :class="expandidoId === punto.id
                      ? CONFIG_TIPO[punto.tipo].cardActive
                      : CONFIG_TIPO[punto.tipo].cardHover">
                    <div class="flex-1 min-w-0">
                      <div class="flex items-center gap-2 min-w-0">
                        <p class="text-sm font-semibold text-default dark:text-default leading-snug truncate">
                          {{ punto.nombre }}
                        </p>
                        <!-- Aviso si el punto no tiene coordenadas GPS -->
                        <span v-if="!punto.latitud || !punto.longitud"
                          title="Sin coordenadas — no aparece en el mapa"
                          class="flex-shrink-0 text-[10px] text-amber-600 dark:text-amber-400
                                 border border-amber-300 dark:border-amber-600 rounded px-1">
                          sin GPS
                        </span>
                        <!-- Badge estado AT -->
                        <div v-if="punto.tipo === 'AT' && disponibilidadMap.get(punto.id)"
                          class="inline-flex items-center gap-1 flex-shrink-0">
                          <span class="w-2 h-2 rounded-full"
                            :class="CONFIG_ESTADO[disponibilidadMap.get(punto.id)!.estado].dot"></span>
                          <span class="text-[11px] font-medium"
                            :class="CONFIG_ESTADO[disponibilidadMap.get(punto.id)!.estado].text">
                            {{ CONFIG_ESTADO[disponibilidadMap.get(punto.id)!.estado].label }}
                          </span>
                        </div>
                      </div>
                      <p class="text-xs text-muted mt-0.5 truncate">{{ punto.direccion }}</p>
                    </div>
                    <!-- Icono GPS si tiene coordenadas; chevron neutro si no -->
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
                      stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
                      class="w-4 h-4 flex-shrink-0 transition-transform duration-200"
                      :class="[
                        expandidoId === punto.id ? 'rotate-180' : '',
                        punto.latitud && punto.longitud
                          ? 'text-primary dark:text-primary'
                          : 'text-muted',
                      ]">
                      <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
                      <path d="M6 9l6 6l6 -6" />
                    </svg>
                  </button>

                  <!-- Detalle expandido (idéntico al v1) -->
                  <Transition
                    enter-active-class="transition-all duration-200 ease-out"
                    enter-from-class="opacity-0 max-h-0"
                    enter-to-class="opacity-100 max-h-96"
                    leave-active-class="transition-all duration-150 ease-in"
                    leave-from-class="opacity-100 max-h-96"
                    leave-to-class="opacity-0 max-h-0">
                    <div v-if="expandidoId === punto.id"
                      class="px-3.5 pb-3.5 pt-0 space-y-2.5 overflow-hidden border-t"
                      :class="CONFIG_TIPO[punto.tipo].borderColor">

                      <!-- Dirección -->
                      <div class="flex items-start gap-2 pt-2.5">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
                          stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
                          class="w-3.5 h-3.5 flex-shrink-0 mt-0.5 text-muted">
                          <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
                          <path d="M9 11a3 3 0 1 0 6 0a3 3 0 0 0 -6 0" />
                          <path d="M17.657 16.657l-4.243 4.243a2 2 0 0 1 -2.827 0l-4.244 -4.243a8 8 0 1 1 11.314 0z" />
                        </svg>
                        <p class="text-xs text-muted leading-relaxed">{{ punto.direccion }}</p>
                      </div>

                      <!-- Teléfono -->
                      <div v-if="punto.telefono" class="flex items-start gap-2">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
                          stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
                          class="w-3.5 h-3.5 flex-shrink-0 mt-0.5 text-muted">
                          <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
                          <path d="M5 4h4l2 5l-2.5 1.5a11 11 0 0 0 5 5l1.5 -2.5l5 2v4a2 2 0 0 1 -2 2a16 16 0 0 1 -15 -15a2 2 0 0 1 2 -2" />
                        </svg>
                        <p class="text-xs text-muted">{{ punto.telefono }}</p>
                      </div>

                      <!-- Horario -->
                      <div v-if="punto.horario" class="flex items-start gap-2">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
                          stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
                          class="w-3.5 h-3.5 flex-shrink-0 mt-0.5 text-muted">
                          <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
                          <path d="M3 12a9 9 0 1 0 18 0a9 9 0 0 0 -18 0" />
                          <path d="M12 7v5l3 3" />
                        </svg>
                        <p class="text-xs text-muted">{{ punto.horario }}</p>
                      </div>

                      <!-- Nota -->
                      <div v-if="punto.nota" class="flex items-start gap-2">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
                          stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
                          class="w-3.5 h-3.5 flex-shrink-0 mt-0.5 text-muted">
                          <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
                          <path d="M3 12a9 9 0 1 0 18 0a9 9 0 0 0 -18 0" />
                          <path d="M12 9h.01" /><path d="M11 12h1v4h1" />
                        </svg>
                        <p class="text-xs text-muted">{{ punto.nota }}</p>
                      </div>

                      <!-- Sección exclusiva AT: disponibilidad y billetes -->
                      <template v-if="punto.tipo === 'AT'">
                        <div v-if="disponibilidadMap.get(punto.id)"
                          class="mt-1 rounded-lg p-3 space-y-2"
                          :class="{
                            'bg-green-50 dark:bg-green-950/30 border border-green-100 dark:border-green-900/50':
                              disponibilidadMap.get(punto.id)!.estado === 'operativo',
                            'bg-red-50 dark:bg-red-950/30 border border-red-100 dark:border-red-900/50':
                              disponibilidadMap.get(punto.id)!.estado === 'fuera_de_servicio',
                            'bg-yellow-50 dark:bg-yellow-950/30 border border-yellow-100 dark:border-yellow-900/50':
                              disponibilidadMap.get(punto.id)!.estado === 'sin_efectivo',
                          }">
                          <div class="flex items-center justify-between gap-2">
                            <div class="flex items-center gap-1.5">
                              <span class="w-2 h-2 rounded-full"
                                :class="CONFIG_ESTADO[disponibilidadMap.get(punto.id)!.estado].dot"></span>
                              <span class="text-xs font-semibold"
                                :class="CONFIG_ESTADO[disponibilidadMap.get(punto.id)!.estado].text">
                                {{ CONFIG_ESTADO[disponibilidadMap.get(punto.id)!.estado].label }}
                              </span>
                            </div>
                            <span class="text-[10px] text-muted">
                              {{ formatearFecha(disponibilidadMap.get(punto.id)!.updated) }}
                            </span>
                          </div>
                          <div v-if="disponibilidadMap.get(punto.id)!.billetes?.length">
                            <p class="text-[10px] font-semibold uppercase tracking-wide text-muted mb-1.5">
                              Denominaciones disponibles
                            </p>
                            <div class="flex flex-wrap gap-1">
                              <span v-for="b in [...disponibilidadMap.get(punto.id)!.billetes]
                                .map(Number).sort((a, b) => a - b)" :key="b"
                                class="inline-block px-2 py-0.5 rounded-full text-[11px] font-bold
                                      bg-white dark:bg-bpa-950/60 text-default dark:text-default
                                      border border-bpa-100 dark:border-bpa-800">
                                {{ b }} CUP
                              </span>
                            </div>
                          </div>
                        </div>
                        <div v-else
                          class="rounded-lg px-3 py-2.5 bg-bpa-50/50 dark:bg-bpa-950/30
                                 border border-bpa-100 dark:border-bpa-800">
                          <p class="text-xs text-muted italic">Estado del cajero no disponible.</p>
                        </div>
                      </template>

                      <!-- Código de sucursal -->
                      <p v-if="punto.codigo_sucursal" class="text-[10px] text-muted mt-1">
                        Código sucursal: {{ punto.codigo_sucursal }}
                      </p>
                    </div>
                  </Transition>

                </div>
              </div>
            </div>
          </div>
        </div>
        <!-- fin columna derecha -->

      </div>
      <!-- fin grid -->

    </template>
  </div>
</template>

<style>
/*
 * CSS de Leaflet — necesario para que el mapa se renderice correctamente.
 * Se importa aquí y no en tailwind.css para mantener el scope del componente.
 */
@import 'leaflet/dist/leaflet.css';

/*
 * Fix rutas de imágenes de Leaflet en entorno compilado (air-gapped).
 * Las imágenes viven en public/leaflet-images/ (copiadas desde node_modules/leaflet/dist/images/).
 * Comando de copia: cp -r node_modules/leaflet/dist/images public/leaflet-images
 * El directorio public/leaflet-images/ debe estar en .gitignore.
 */
.leaflet-default-icon-path {
  background-image: url(/leaflet-images/marker-icon.png);
}

/*
 * isolation:isolate en el contenedor del mapa crea un contexto de apilamiento
 * propio. Los z-index internos de Leaflet (panes: 400, controles: 1000+) quedan
 * confinados aquí y no compiten con el z-index del header (z-40) ni tapan los
 * inputs del panel lateral. Necesario también para que el menú hamburguesa
 * en móvil aparezca siempre por encima del mapa.
 */
.mapa-wrapper {
  isolation: isolate;
  position: relative;
}

/* Fondo del mapa cuando no hay tiles (ej: zoom fuera del rango descargado) */
.leaflet-container {
  background: #e8f5ee; /* bpa-50 — coherente con el fondo de página */
  font-family: system-ui, sans-serif;
}

/* Estilo del panel de atribución de OpenStreetMap */
.leaflet-control-attribution {
  font-size: 10px;
  background: rgba(255,255,255,0.85) !important;
}
</style>
