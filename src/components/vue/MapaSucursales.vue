<script setup lang="ts">
/**
 * @componente  src/components/vue/MapaSucursales.vue
 * @directiva   client:load
 *
 * @coleccion   puntos_de_atencion
 *   nombre           Text
 *   tipo             Select  'S' | 'AN' | 'CA' | 'CAE' | 'AT'
 *   codigo_sucursal  Text
 *   municipio        Select  slug del <path> del SVG
 *   direccion        Text
 *   telefono         Text
 *   horario          Text
 *   nota             Text
 *   latitud          Number
 *   longitud         Number
 *   orden            Number
 *   publicado        Bool
 *
 * @coleccion   disponibilidad_at
 *   cajero     Relation → puntos_de_atencion
 *   billetes   Select multi
 *   estado     Select → 'operativo' | 'fuera_de_servicio' | 'sin_efectivo'
 *   updated    Date
 *
 * @paleta de tipos:
 *   S   → Verde BPA  (color institucional del banco)
 *   AN  → Violeta    (conservado — distinción visual clara)
 *   CA  → Azul-700   (caja de ahorro)
 *   CAE → Sky-600    (caja de ahorro extendida — azul más claro)
 *   AT  → Ámbar      (conservado — cajero automático)
 */

import { ref, computed, onMounted } from 'vue';
import { pb } from '~/lib/pocketbase';

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
  label:         string;
  badgeBg:       string;
  badgeText:     string;
  svgFill:       string;
  svgFillActive: string;
  borderColor:   string;
}> = {
  S: {
    label:         'Sucursal',
    badgeBg:       'bg-emerald-100 dark:bg-emerald-900/40',
    badgeText:     'text-emerald-700 dark:text-emerald-300',
    svgFill:       '#065f46',
    svgFillActive: '#059669',
    borderColor:   'border-emerald-200 dark:border-emerald-800',
  },
  AN: {
    label:         'Área de Negocio',
    badgeBg:       'bg-violet-100 dark:bg-violet-900/40',
    badgeText:     'text-violet-700 dark:text-violet-300',
    svgFill:       '#5b21b6',
    svgFillActive: '#7c3aed',
    borderColor:   'border-violet-200 dark:border-violet-800',
  },
  CA: {
    label:         'Caja de Ahorro',
    badgeBg:       'bg-blue-100 dark:bg-blue-900/40',
    badgeText:     'text-blue-700 dark:text-blue-300',
    svgFill:       '#1d4ed8',   // blue-700
    svgFillActive: '#2563eb',   // blue-600
    borderColor:   'border-blue-200 dark:border-blue-800',
  },
  CAE: {
    label:         'Caja Ahorro Extendida',
    badgeBg:       'bg-sky-100 dark:bg-sky-900/40',
    badgeText:     'text-sky-700 dark:text-sky-300',
    svgFill:       '#0284c7',   // sky-600
    svgFillActive: '#0ea5e9',   // sky-500
    borderColor:   'border-sky-200 dark:border-sky-800',
  },
  AT: {
    label:         'Cajero Automático',
    badgeBg:       'bg-amber-100 dark:bg-amber-900/40',
    badgeText:     'text-amber-700 dark:text-amber-300',
    svgFill:       '#b45309',
    svgFillActive: '#d97706',
    borderColor:   'border-amber-200 dark:border-amber-800',
  },
};

const CONFIG_ESTADO: Record<EstadoAT, { label: string; dot: string; text: string }> = {
  operativo:         { label: 'Operativo',         dot: 'bg-green-500',  text: 'text-green-700 dark:text-green-400'      },
  fuera_de_servicio: { label: 'Fuera de servicio', dot: 'bg-red-500',    text: 'text-red-700 dark:text-red-400'          },
  sin_efectivo:      { label: 'Sin efectivo',      dot: 'bg-yellow-400', text: 'text-yellow-700 dark:text-yellow-400'    },
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

const ORDEN_TIPOS: TipoPunto[] = ['S', 'AN', 'CA', 'CAE', 'AT'];

// ── Estado reactivo ───────────────────────────────────────────────────────────
const expandidoId      = ref<string | null>(null);
const cargando         = ref(true);
const errorDB          = ref(false);
const todos            = ref<PuntoAtencion[]>([]);
const disponibilidades = ref<DisponibilidadAT[]>([]);
const municipioActivo  = ref<string | null>(null);
const busqueda         = ref('');
const filtrosTipo      = ref<Set<TipoPunto>>(new Set());

// ── Computed ──────────────────────────────────────────────────────────────────
const disponibilidadMap = computed((): Map<string, DisponibilidadAT> => {
  const map = new Map<string, DisponibilidadAT>();
  for (const d of disponibilidades.value) map.set(d.cajero, d);
  return map;
});

const municipiosConPuntos = computed((): Set<string> => {
  const s = new Set<string>();
  for (const p of todos.value) if (p.municipio) s.add(p.municipio);
  return s;
});

const puntosFiltrados = computed((): PuntoAtencion[] => {
  if (!municipioActivo.value) return [];
  let lista = todos.value.filter(p => p.municipio === municipioActivo.value);
  const q = normalizar(busqueda.value.trim());
  if (q) lista = lista.filter(p => normalizar(p.nombre).includes(q) || normalizar(p.direccion).includes(q));
  if (filtrosTipo.value.size > 0) lista = lista.filter(p => filtrosTipo.value.has(p.tipo));
  return lista;
});

const puntosAgrupados = computed((): { tipo: TipoPunto; items: PuntoAtencion[] }[] => {
  const grupos: { tipo: TipoPunto; items: PuntoAtencion[] }[] = [];
  for (const tipo of ORDEN_TIPOS) {
    const items = puntosFiltrados.value.filter(p => p.tipo === tipo);
    if (items.length > 0) grupos.push({ tipo, items });
  }
  return grupos;
});

const conteoTipo = computed((): Partial<Record<TipoPunto, number>> => {
  if (!municipioActivo.value) return {};
  const conteo: Partial<Record<TipoPunto, number>> = {};
  for (const p of todos.value.filter(p => p.municipio === municipioActivo.value)) {
    conteo[p.tipo] = (conteo[p.tipo] ?? 0) + 1;
  }
  return conteo;
});

// ── Helpers ───────────────────────────────────────────────────────────────────
function normalizar(texto: string): string {
  return texto.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function seleccionarMunicipio(slug: string) {
  if (!municipiosConPuntos.value.has(slug)) return;
  municipioActivo.value = municipioActivo.value === slug ? null : slug;
  busqueda.value        = '';
  filtrosTipo.value     = new Set();
  expandidoId.value     = null;
}

function colorPath(slug: string): string {
  if (!municipiosConPuntos.value.has(slug)) return '#cbd5e1';  // slate-300 — neutro
  if (municipioActivo.value === slug)        return '#065f46';  // bpa-800 — seleccionado
  return '#6ee7b7';                                             // bpa-200 aprox — tiene puntos
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
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

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

onMounted(cargarDatos);
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
      <p class="text-xs text-red-500">Verifique la conexión con el servidor.</p>
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
            :style="{ backgroundColor: CONFIG_TIPO[tipo].svgFill }"></span>
          {{ tipo }} — {{ CONFIG_TIPO[tipo].label }}
        </div>
      </div>

      <!-- Layout bicolumna: SVG | Panel -->
      <div class="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-6 lg:h-[calc(100vh-10rem)]">

        <!-- ── Columna izquierda: Mapa SVG ───────────────────────────────── -->
        <div class="rounded-2xl border border-bpa-200 dark:border-bpa-amber-800
                    bg-bpa-50/50 dark:bg-bpa-950/40 p-4 overflow-hidden
                    lg:h-full flex flex-col">

          <p class="text-xs text-muted text-center mb-3">
            <span v-if="!municipioActivo">Haga clic en un municipio para ver sus oficinas</span>
            <span v-else class="font-semibold text-primary dark:text-primary">
              {{ NOMBRE_MUNICIPIO[municipioActivo] }} —
              {{ todos.filter(p => p.municipio === municipioActivo).length }} punto(s)
            </span>
          </p>

          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 480"
            class="w-full h-auto lg:flex-1 lg:min-h-0" role="img" aria-label="Mapa de Santiago de Cuba">

            <path id="guama" d="M 0,55 L 125,30 L 138,180 L 130,390 L 0,410 Z"
              :fill="colorPath('guama')" stroke="white" stroke-width="2"
              class="transition-all duration-200"
              :class="municipiosConPuntos.has('guama') ? 'cursor-pointer hover:opacity-80' : 'cursor-default'"
              @click="seleccionarMunicipio('guama')"><title>Guamá</title></path>

            <path id="segundo-frente" d="M 125,30 L 285,8 L 305,170 L 195,195 L 138,180 Z"
              :fill="colorPath('segundo-frente')" stroke="white" stroke-width="2"
              class="transition-all duration-200"
              :class="municipiosConPuntos.has('segundo-frente') ? 'cursor-pointer hover:opacity-80' : 'cursor-default'"
              @click="seleccionarMunicipio('segundo-frente')"><title>Segundo Frente</title></path>

            <path id="tercer-frente" d="M 138,180 L 195,195 L 220,340 L 180,435 L 130,430 L 130,390 Z"
              :fill="colorPath('tercer-frente')" stroke="white" stroke-width="2"
              class="transition-all duration-200"
              :class="municipiosConPuntos.has('tercer-frente') ? 'cursor-pointer hover:opacity-80' : 'cursor-default'"
              @click="seleccionarMunicipio('tercer-frente')"><title>Tercer Frente</title></path>

            <path id="contramaestre" d="M 285,8 L 480,0 L 490,170 L 305,170 Z"
              :fill="colorPath('contramaestre')" stroke="white" stroke-width="2"
              class="transition-all duration-200"
              :class="municipiosConPuntos.has('contramaestre') ? 'cursor-pointer hover:opacity-80' : 'cursor-default'"
              @click="seleccionarMunicipio('contramaestre')"><title>Contramaestre</title></path>

            <path id="palma-soriano" d="M 305,170 L 490,170 L 510,355 L 390,385 L 255,350 L 220,340 L 195,195 Z"
              :fill="colorPath('palma-soriano')" stroke="white" stroke-width="2"
              class="transition-all duration-200"
              :class="municipiosConPuntos.has('palma-soriano') ? 'cursor-pointer hover:opacity-80' : 'cursor-default'"
              @click="seleccionarMunicipio('palma-soriano')"><title>Palma Soriano</title></path>

            <path id="santiago-de-cuba" d="M 220,340 L 255,350 L 390,385 L 405,460 L 295,472 L 175,458 L 180,435 Z"
              :fill="colorPath('santiago-de-cuba')" stroke="white" stroke-width="2"
              class="transition-all duration-200"
              :class="municipiosConPuntos.has('santiago-de-cuba') ? 'cursor-pointer hover:opacity-80' : 'cursor-default'"
              @click="seleccionarMunicipio('santiago-de-cuba')"><title>Santiago de Cuba</title></path>

            <path id="san-luis" d="M 390,385 L 510,355 L 535,455 L 490,470 L 405,460 Z"
              :fill="colorPath('san-luis')" stroke="white" stroke-width="2"
              class="transition-all duration-200"
              :class="municipiosConPuntos.has('san-luis') ? 'cursor-pointer hover:opacity-80' : 'cursor-default'"
              @click="seleccionarMunicipio('san-luis')"><title>San Luis</title></path>

            <path id="songo-la-maya" d="M 490,170 L 645,88 L 655,315 L 535,340 L 510,355 L 490,170 Z"
              :fill="colorPath('songo-la-maya')" stroke="white" stroke-width="2"
              class="transition-all duration-200"
              :class="municipiosConPuntos.has('songo-la-maya') ? 'cursor-pointer hover:opacity-80' : 'cursor-default'"
              @click="seleccionarMunicipio('songo-la-maya')"><title>Songo - La Maya</title></path>

            <path id="mella" d="M 645,88 L 800,62 L 800,472 L 535,472 L 490,470 L 535,455 L 535,340 L 655,315 Z"
              :fill="colorPath('mella')" stroke="white" stroke-width="2"
              class="transition-all duration-200"
              :class="municipiosConPuntos.has('mella') ? 'cursor-pointer hover:opacity-80' : 'cursor-default'"
              @click="seleccionarMunicipio('mella')"><title>Mella</title></path>

            <g font-size="11" font-family="system-ui, sans-serif"
              fill="white" text-anchor="middle" pointer-events="none">
              <text x="65"  y="230">Guamá</text>
              <text x="200" y="100">II Frente</text>
              <text x="158" y="310">III Frente</text>
              <text x="380" y="90">Contramaestre</text>
              <text x="355" y="285">Palma Soriano</text>
              <text x="290" y="425">Stgo. de Cuba</text>
              <text x="455" y="440">San Luis</text>
              <text x="575" y="265">Songo-La Maya</text>
              <text x="690" y="290">Mella</text>
            </g>
          </svg>
        </div>

        <!-- ── Columna derecha: Panel de oficinas ────────────────────────── -->
        <div class="flex flex-col gap-4 lg:h-full lg:overflow-hidden min-h-[400px]">

          <!-- Sin municipio seleccionado -->
          <div v-if="!municipioActivo"
            class="flex-1 flex flex-col items-center justify-center gap-3 rounded-2xl
                  border-2 border-dashed border-bpa-200 dark:border-bpa-amber-800
                  text-muted p-8 text-center">
            <!-- tabler:map-pin -->
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"
              class="w-12 h-12 text-bpa-200 dark:text-bpa-amber-800">
              <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
              <path d="M9 11a3 3 0 1 0 6 0a3 3 0 0 0 -6 0" />
              <path d="M17.657 16.657l-4.243 4.243a2 2 0 0 1 -2.827 0l-4.244 -4.243a8 8 0 1 1 11.314 0z" />
            </svg>
            <p class="text-sm">Seleccione un municipio en el mapa para ver sus oficinas y cajeros.</p>
          </div>

          <!-- Con municipio seleccionado -->
          <template v-else>

            <!-- Cabecera del panel -->
            <div class="flex items-center justify-between gap-2">
              <h3 class="font-bold text-default dark:text-default text-base leading-tight">
                {{ NOMBRE_MUNICIPIO[municipioActivo] }}
              </h3>
              <button @click="municipioActivo = null; limpiarFiltros()"
                class="p-1.5 rounded-lg text-muted hover:text-default dark:hover:text-default
                      hover:bg-bpa-50 dark:hover:bg-bpa-800/40 transition-colors flex-shrink-0"
                title="Deseleccionar municipio">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"
                  class="w-4 h-4">
                  <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
                  <path d="M18 6l-12 12" /><path d="M6 6l12 12" />
                </svg>
              </button>
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
              <input v-model="busqueda" type="text"
                placeholder="Buscar por nombre o dirección…"
                class="w-full pl-9 pr-9 py-2 text-sm rounded-lg border border-bpa-200
                      dark:border-bpa-amber-800 bg-white dark:bg-bpa-950/80 text-default dark:text-default
                      placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary transition" />
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

            <!-- Sin resultados -->
            <div v-if="puntosFiltrados.length === 0"
              class="text-center py-10 text-sm text-muted italic">
              No se encontraron oficinas con los filtros actuales.
            </div>

            <!-- Lista agrupada con scroll -->
            <div v-else class="flex-1 overflow-y-auto space-y-5 pr-1 min-h-0
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
                    class="rounded-xl border overflow-hidden transition-shadow hover:shadow-sm"
                    :class="CONFIG_TIPO[punto.tipo].borderColor">

                    <!-- Cabecera tarjeta -->
                    <button @click="toggleExpansion(punto.id)"
                      class="w-full flex items-center justify-between gap-2 px-3.5 py-3
                            text-left hover:bg-bpa-50 dark:hover:bg-bpa-800/20 transition-colors">
                      <div class="flex-1 min-w-0">
                        <div class="flex items-center gap-2 min-w-0">
                          <p class="text-sm font-semibold text-default dark:text-default leading-snug truncate">
                            {{ punto.nombre }}
                          </p>
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
                      <!-- Chevron rotable -->
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
                        stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"
                        class="w-4 h-4 flex-shrink-0 text-muted transition-transform duration-200"
                        :class="expandidoId === punto.id ? 'rotate-180' : ''">
                        <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
                        <path d="M6 9l6 6l6 -6" />
                      </svg>
                    </button>

                    <!-- Detalle expandido -->
                    <Transition
                      enter-active-class="transition-all duration-200 ease-out"
                      enter-from-class="opacity-0 max-h-0"
                      enter-to-class="opacity-100 max-h-96"
                      leave-active-class="transition-all duration-150 ease-in"
                      leave-from-class="opacity-100 max-h-96"
                      leave-to-class="opacity-0 max-h-0">
                      <div v-if="expandidoId === punto.id"
                        class="px-3.5 pb-3.5 pt-0 border-t border-bpa-100 dark:border-bpa-800 space-y-2.5 overflow-hidden">

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

                        <!-- Sección exclusiva AT -->
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
                            <!-- Estado + fecha actualización -->
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
                            <!-- Billetes disponibles -->
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

          </template>
        </div>
        <!-- fin columna derecha -->

      </div>
      <!-- fin grid -->

    </template>

  </div>
</template>
