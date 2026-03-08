<script setup lang="ts">
/**
 * @componente  src/components/vue/FormularioContacto.vue
 *
 * @responsabilidad  EXCLUSIVAMENTE lo reactivo:
 *   · Cambio de pestaña activa (feedback / queja)
 *   · Binding de campos con v-model
 *   · Validación client-side antes del envío
 *   · Estados del ciclo de vida del envío: idle → enviando → éxito | error
 *   · Petición a PocketBase — colecciones: mensajes / quejas_sugerencias
 *
 * @lo_que_NO_hace_este_componente
 *   El layout exterior (grid 2/3 + 1/3), el aside informativo, el título
 *   "Escríbanos", el WidgetWrapper y el fondo de sección son responsabilidad
 *   de ContactoBPA.astro — generado en build, sin JS en el cliente.
 *
 * @colecciones
 *   mensajes: nombre(Text) · correo(Email) · asunto(Text) · mensaje(Text) · leido(Bool)
 *   quejas_sugerencias: tipo(Text) · nombre(Text) · direccion(Text) · municipio(Text) · telefono(Text) · motivo(Text) · mensaje(Text) · leido(Bool)
 *
 * @dependencias  ~/lib/pocketbase
 * @directiva     client:load  (en ContactoBPA.astro)
 */

import { ref, reactive, computed, watch } from 'vue';
import { pb } from '~/lib/pocketbase';

// ── Pestaña activa ───────────────────────────────────────────────────────────
type TabId = 'feedback' | 'queja';
const tabActiva = ref<TabId>('feedback');

// ── Estado del ciclo de envío ────────────────────────────────────────────────
type EstadoEnvio = 'idle' | 'enviando' | 'exito' | 'error';
const estado    = ref<EstadoEnvio>('idle');
const errServer = ref('');

// ── Modelos de datos ─────────────────────────────────────────────────────────
const feedback = reactive({ nombre: '', correo: '', asunto: '', mensaje: '' });

const queja = reactive({
  tipo: 'queja' as 'queja' | 'sugerencia',
  nombre: '', direccion: '', municipio: '', telefono: '', correo: '', motivo: '', mensaje: '',
});

// ── Catálogos estáticos ───────────────────────────────────────────────────────
const motivosQueja = [
  'Falta de información',
  'Demora en el servicio',
  'Inconformidad con el trámite realizado',
  'Maltrato',
  'Sobre el servicio del pago a jubilados y pensionados',
  'Sobre el servicio de créditos sociales',
  'Sobre el servicio de transferencias monetarias',
  'Sobre el servicio de tramitación de títulos de propiedad de la vivienda',
  'Otros',
];

const municipiosSCU = [
  'Santiago de Cuba', 'Contramaestre', 'San Luis', 'Segundo Frente',
  'Songo - La Maya', 'Palma Soriano', 'Mella', 'Guamá', 'Tercer Frente', 'Otro',
];

// ── Validaciones ─────────────────────────────────────────────────────────────
const reEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const errFeedback = computed(() => {
  const e: Record<string, string> = {};
  if (!feedback.nombre.trim())                     e.nombre  = 'El nombre es obligatorio.';
  if (!feedback.correo.trim())                     e.correo  = 'El correo es obligatorio.';
  else if (!reEmail.test(feedback.correo.trim()))  e.correo  = 'Ingrese un correo válido.';
  if (!feedback.asunto.trim())                     e.asunto  = 'El asunto es obligatorio.';
  if (!feedback.mensaje.trim())                    e.mensaje = 'El mensaje no puede estar vacío.';
  return e;
});

const errQueja = computed(() => {
  const e: Record<string, string> = {};
  if (!queja.nombre.trim())                       e.nombre    = 'El nombre y apellidos son obligatorios.';
  if (!queja.municipio)                           e.municipio = 'Seleccione el municipio.';
  if (queja.tipo === 'queja' && !queja.motivo)    e.motivo    = 'Seleccione el motivo de la queja.';
  if (!queja.mensaje.trim())                      e.mensaje   = 'Describa su queja o sugerencia.';
  return e;
});

// Muestra el error de un campo solo después de que el usuario lo haya tocado
const tocado = reactive<Record<string, boolean>>({});
const tocar  = (c: string) => { tocado[c] = true; };

// Limpia el motivo si el usuario cambia a "sugerencia" — evita enviar datos
// de queja residuales en un registro de sugerencia.
watch(() => queja.tipo, (nuevoTipo) => {
  if (nuevoTipo === 'sugerencia') {
    queja.motivo = '';
    delete tocado['motivo'];
  }
});

// ── Clases reactivas para inputs (centraliza la lógica de error visual) ───────
function claseInput(campo: string, errores: Record<string, string>) {
  const base = [
    'w-full rounded-lg border px-4 py-2.5 text-sm transition',
    'bg-white dark:bg-slate-900',
    'text-slate-800 dark:text-slate-200',
    'placeholder:text-slate-400 dark:placeholder:text-slate-500',
    'focus:outline-none focus:ring-2',
  ];
  const conError = 'border-red-400 dark:border-red-500 focus:ring-red-300/50 bg-red-50 dark:bg-red-900/20';
  const sinError = 'border-gray-300 dark:border-slate-600 focus:ring-primary/40';
  base.push(tocado[campo] && errores[campo] ? conError : sinError);
  return base.join(' ');
}

// ── Envío Tab 1 · Mensaje ─────────────────────────────────────────────────────
async function enviarFeedback() {
  ['nombre', 'correo', 'asunto', 'mensaje'].forEach(tocar);
  if (Object.keys(errFeedback.value).length) return;
  estado.value = 'enviando';
  try {
    await pb.collection('mensajes').create({
      leido: false,
      nombre:  feedback.nombre.trim(),
      correo:  feedback.correo.trim(),
      asunto:  feedback.asunto.trim(),
      mensaje: feedback.mensaje.trim(),
    });
    estado.value = 'exito';
    Object.assign(feedback, { nombre: '', correo: '', asunto: '', mensaje: '' });
    Object.keys(tocado).forEach(k => delete tocado[k]);
  } catch (err: unknown) {
    estado.value = 'error';
    errServer.value = err instanceof Error ? err.message : 'No se pudo enviar. Intente más tarde.';
  }
}

// ── Envío Tab 2 · Queja o Sugerencia ─────────────────────────────────────────
async function enviarQueja() {
  const camposRequeridos = ['nombre', 'municipio', 'mensaje'];
  if (queja.tipo === 'queja') camposRequeridos.push('motivo');
  camposRequeridos.forEach(tocar);
  if (Object.keys(errQueja.value).length) return;
  estado.value = 'enviando';
  try {
    await pb.collection('quejas_sugerencias').create({
      leido: false,
      tipo:      queja.tipo,
      nombre:    queja.nombre.trim(),
      direccion: queja.direccion.trim(),
      municipio: queja.municipio,
      telefono:  queja.telefono.trim(),
      motivo:    queja.motivo,
      correo:    queja.correo.trim(),
      mensaje:   queja.mensaje.trim(),
    });
    estado.value = 'exito';
    Object.assign(queja, { tipo: 'queja', nombre: '', direccion: '', municipio: '', telefono: '', correo: '', motivo: '', mensaje: '' });
    Object.keys(tocado).forEach(k => delete tocado[k]);
  } catch (err: unknown) {
    estado.value = 'error';
    errServer.value = err instanceof Error ? err.message : 'No se pudo enviar. Intente más tarde.';
  }
}

// ── Utilidades de UI ──────────────────────────────────────────────────────────
function reintentar() { estado.value = 'idle'; errServer.value = ''; }

function cambiarTab(tab: TabId) {
  tabActiva.value = tab;
  estado.value    = 'idle';
  errServer.value = '';
  Object.keys(tocado).forEach(k => delete tocado[k]);
}
</script>

<template>
  <!--
    Este componente renderiza SOLO la columna izquierda del grid.
    El grid exterior (2/3 + 1/3) y el aside derecho los construye
    ContactoBPA.astro en tiempo de build.
  -->

  <!-- ══════════════════════════════════════════════════════════════════════
      PESTAÑAS DE SELECCIÓN
  ══════════════════════════════════════════════════════════════════════ -->
  <div
    class="flex border-b border-gray-200 dark:border-slate-700 mb-7"
    role="tablist"
  >
    <!-- Tab: Mensaje o Sugerencia -->
    <button
      role="tab"
      :aria-selected="tabActiva === 'feedback'"
      @click="cambiarTab('feedback')"
      :class="[
        'flex items-center gap-2 px-5 py-3 text-sm font-semibold border-b-2 -mb-px transition-colors duration-150 focus:outline-none',
        tabActiva === 'feedback'
          ? 'border-primary text-primary'
          : 'border-transparent text-muted hover:text-default dark:hover:text-slate-200',
      ]"
    >
      <!-- tabler:message -->
      <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
        <path d="M8 9h8" /><path d="M8 13h6" />
        <path d="M18 4a3 3 0 0 1 3 3v8a3 3 0 0 1 -3 3h-5l-5 3v-3h-2a3 3 0 0 1 -3 -3v-8a3 3 0 0 1 3 -3h12" />
      </svg>
      Mensaje
    </button>

    <!-- Tab: Queja o Reclamación -->
    <button
      role="tab"
      :aria-selected="tabActiva === 'queja'"
      @click="cambiarTab('queja')"
      :class="[
        'flex items-center gap-2 px-5 py-3 text-sm font-semibold border-b-2 -mb-px transition-colors duration-150 focus:outline-none',
        tabActiva === 'queja'
          ? 'border-primary text-primary'
          : 'border-transparent text-muted hover:text-default dark:hover:text-slate-200',
      ]"
    >
      <!-- tabler:file-description -->
      <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
        <path d="M14 3v4a1 1 0 0 0 1 1h4" />
        <path d="M17 21h-10a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2h7l5 5v11a2 2 0 0 1 -2 2z" />
        <path d="M9 17h6" /><path d="M9 13h6" />
      </svg>
      Queja o Sugerencia
    </button>
  </div>

  <!-- ══════════════════════════════════════════════════════════════════════
      ESTADO: ÉXITO
  ══════════════════════════════════════════════════════════════════════ -->
  <div
    v-if="estado === 'exito'"
    class="flex flex-col items-center justify-center text-center py-16 px-6 rounded-xl border border-green-200 dark:border-green-700 bg-green-50 dark:bg-green-900/20"
  >
    <!-- tabler:circle-check -->
    <svg xmlns="http://www.w3.org/2000/svg" class="w-14 h-14 text-green-500 dark:text-green-400 mb-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
      <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
      <path d="M3 12a9 9 0 1 0 18 0a9 9 0 1 0 -18 0" />
      <path d="M9 12l2 2l4 -4" />
    </svg>
    <h3 class="text-xl font-bold font-heading text-green-800 dark:text-green-300 mb-2">
      Mensaje enviado con éxito
    </h3>
    <p class="text-green-700 dark:text-green-400 text-sm max-w-sm">
      <template v-if="tabActiva === 'feedback'">
        Gracias por comunicarse con nosotros. Su mensaje ha sido registrado
        y un representante lo atenderá a la brevedad posible.
      </template>
      <template v-else>
        Su queja o sugerencia ha quedado registrada. Tiene derecho a
        recibir respuesta en un plazo de <strong>30 días hábiles</strong>
        a partir de la fecha de recepción.
      </template>
    </p>
    <button
      @click="estado = 'idle'"
      class="mt-6 text-sm text-green-700 dark:text-green-400 underline hover:no-underline"
    >
      Enviar otro mensaje
    </button>
  </div>

  <!-- ══════════════════════════════════════════════════════════════════════
      ESTADO: ERROR
  ══════════════════════════════════════════════════════════════════════ -->
  <div
    v-else-if="estado === 'error'"
    class="flex flex-col items-center justify-center text-center py-12 px-6 rounded-xl border border-red-200 dark:border-red-700 bg-red-50 dark:bg-red-900/20"
  >
    <!-- tabler:alert-triangle -->
    <svg xmlns="http://www.w3.org/2000/svg" class="w-12 h-12 text-red-400 mb-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
      <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
      <path d="M12 9v4" />
      <path d="M10.363 3.591l-8.106 13.534a1.914 1.914 0 0 0 1.636 2.871h16.214a1.914 1.914 0 0 0 1.636 -2.87l-8.106 -13.536a1.914 1.914 0 0 0 -3.274 0" />
      <path d="M12 16h.01" />
    </svg>
    <h3 class="text-lg font-bold font-heading text-red-700 dark:text-red-400 mb-1">
      Error al enviar
    </h3>
    <p class="text-muted text-sm mb-4">{{ errServer }}</p>
    <button @click="reintentar" class="text-sm font-semibold text-red-700 dark:text-red-400 underline hover:no-underline">
      Intentar de nuevo
    </button>
  </div>

  <!-- ══════════════════════════════════════════════════════════════════════
      FORMULARIOS  (estado: idle / enviando)
  ══════════════════════════════════════════════════════════════════════ -->
  <template v-else>

    <!-- ────────────────────────────────────────────────────────────────
        TAB 1 · Mensaje
    ──────────────────────────────────────────────────────────────── -->
    <form v-if="tabActiva === 'feedback'" @submit.prevent="enviarFeedback" novalidate class="space-y-5">

      <!-- Nombre -->
      <div>
        <label for="fb-nombre" class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
          Nombre y apellidos <span class="text-red-500">*</span>
        </label>
        <input id="fb-nombre" v-model="feedback.nombre" @blur="tocar('nombre')"
          type="text" autocomplete="name" placeholder="Ej: Juan García Pérez"
          :class="claseInput('nombre', errFeedback)"
        />
        <p v-if="tocado['nombre'] && errFeedback['nombre']" class="mt-1 text-xs text-red-500 dark:text-red-400">
          {{ errFeedback['nombre'] }}
        </p>
      </div>

      <!-- Correo -->
      <div>
        <label for="fb-correo" class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
          Correo electrónico <span class="text-red-500">*</span>
        </label>
        <input id="fb-correo" v-model="feedback.correo" @blur="tocar('correo')"
          type="email" autocomplete="email" placeholder="ejemplo@correo.cu"
          :class="claseInput('correo', errFeedback)"
        />
        <p v-if="tocado['correo'] && errFeedback['correo']" class="mt-1 text-xs text-red-500 dark:text-red-400">
          {{ errFeedback['correo'] }}
        </p>
      </div>

      <!-- Asunto -->
      <div>
        <label for="fb-asunto" class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
          Asunto <span class="text-red-500">*</span>
        </label>
        <input id="fb-asunto" v-model="feedback.asunto" @blur="tocar('asunto')"
          type="text" placeholder="Resumen breve de su consulta"
          :class="claseInput('asunto', errFeedback)"
        />
        <p v-if="tocado['asunto'] && errFeedback['asunto']" class="mt-1 text-xs text-red-500 dark:text-red-400">
          {{ errFeedback['asunto'] }}
        </p>
      </div>

      <!-- Mensaje -->
      <div>
        <label for="fb-mensaje" class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
          Mensaje <span class="text-red-500">*</span>
        </label>
        <textarea id="fb-mensaje" v-model="feedback.mensaje" @blur="tocar('mensaje')"
          rows="5" placeholder="Escriba aquí su consulta o pregunta con el mayor detalle posible…"
          :class="claseInput('mensaje', errFeedback) + ' resize-none'"
        />
        <p v-if="tocado['mensaje'] && errFeedback['mensaje']" class="mt-1 text-xs text-red-500 dark:text-red-400">
          {{ errFeedback['mensaje'] }}
        </p>
      </div>

      <button type="submit" :disabled="estado === 'enviando'"
        class="btn-primary inline-flex items-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
      >
        <svg v-if="estado === 'enviando'" class="animate-spin w-4 h-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
        </svg>
        <!-- tabler:send -->
        <svg v-else xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
          <path d="M10 14l11 -11" />
          <path d="M21 3l-6.5 18a.55 .55 0 0 1 -1 0l-3.5 -7l-7 -3.5a.55 .55 0 0 1 0 -1l18 -6.5" />
        </svg>
        {{ estado === 'enviando' ? 'Enviando…' : 'Enviar mensaje' }}
      </button>
    </form>

    <!-- ────────────────────────────────────────────────────────────────
        TAB 2 · Queja o Sugerencia
    ──────────────────────────────────────────────────────────────── -->
    <form v-else-if="tabActiva === 'queja'" @submit.prevent="enviarQueja" novalidate class="space-y-5">

      <!-- Selector de tipo: Queja / Sugerencia -->
      <div class="flex gap-6">
        <label class="flex items-center gap-2 cursor-pointer text-sm font-medium text-slate-700 dark:text-slate-300">
          <input type="radio" v-model="queja.tipo" value="queja"
            class="w-4 h-4 text-primary border-gray-300 dark:border-slate-600 focus:ring-primary/40"
          />
          Queja
        </label>
        <label class="flex items-center gap-2 cursor-pointer text-sm font-medium text-slate-700 dark:text-slate-300">
          <input type="radio" v-model="queja.tipo" value="sugerencia"
            class="w-4 h-4 text-primary border-gray-300 dark:border-slate-600 focus:ring-primary/40"
          />
          Sugerencia
        </label>
      </div>

      <!-- Nombre y apellidos -->
      <div>
        <label for="qj-nombre" class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
          Nombre y apellidos <span class="text-red-500">*</span>
        </label>
        <input id="qj-nombre" v-model="queja.nombre" @blur="tocar('nombre')"
          type="text" autocomplete="name" placeholder="Ej: María López Domínguez"
          :class="claseInput('nombre', errQueja)"
        />
        <p v-if="tocado['nombre'] && errQueja['nombre']" class="mt-1 text-xs text-red-500 dark:text-red-400">
          {{ errQueja['nombre'] }}
        </p>
      </div>

      <!-- Dirección + Municipio -->
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label for="qj-direccion" class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Dirección</label>
          <input id="qj-direccion" v-model="queja.direccion" type="text" placeholder="Calle, número, reparto…"
            class="w-full rounded-lg border border-gray-300 dark:border-slate-600 px-4 py-2.5 text-sm bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-primary/40 transition"
          />
        </div>
        <div>
          <label for="qj-municipio" class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
            Municipio <span class="text-red-500">*</span>
          </label>
          <select id="qj-municipio" v-model="queja.municipio" @blur="tocar('municipio')"
            :class="claseInput('municipio', errQueja) + ' appearance-none'"
          >
            <option value="" disabled>Seleccione…</option>
            <option v-for="m in municipiosSCU" :key="m" :value="m">{{ m }}</option>
          </select>
          <p v-if="tocado['municipio'] && errQueja['municipio']" class="mt-1 text-xs text-red-500 dark:text-red-400">
            {{ errQueja['municipio'] }}
          </p>
        </div>
      </div>

      <!-- Teléfono -->
      <div>
        <label for="qj-telefono" class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Teléfono de contacto</label>
        <input id="qj-telefono" v-model="queja.telefono" type="tel" autocomplete="tel" placeholder="Ej: (022) 65-XXXX"
          class="w-full rounded-lg border border-gray-300 dark:border-slate-600 px-4 py-2.5 text-sm bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-primary/40 transition"
        />
      </div>

      <!-- Correo electrónico -->
      <div>
        <label for="qj-correo" class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Correo electrónico</label>
        <input id="qj-correo" v-model="queja.correo" type="email" autocomplete="email" placeholder="ejemplo@correo.cu"
          class="w-full rounded-lg border border-gray-300 dark:border-slate-600 px-4 py-2.5 text-sm bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-primary/40 transition"
        />
      </div>

      <!-- Motivo categorizado — solo visible para quejas -->
      <div v-if="queja.tipo === 'queja'">
        <label for="qj-motivo" class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
          Motivo <span class="text-red-500">*</span>
        </label>
        <select id="qj-motivo" v-model="queja.motivo" @blur="tocar('motivo')"
          :class="claseInput('motivo', errQueja) + ' appearance-none'"
        >
          <option value="" disabled>Seleccione el motivo…</option>
          <option v-for="m in motivosQueja" :key="m" :value="m">{{ m }}</option>
        </select>
        <p v-if="tocado['motivo'] && errQueja['motivo']" class="mt-1 text-xs text-red-500 dark:text-red-400">
          {{ errQueja['motivo'] }}
        </p>
      </div>

      <!-- Descripción detallada -->
      <div>
        <label for="qj-mensaje" class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
          Descripción detallada <span class="text-red-500">*</span>
        </label>
        <textarea id="qj-mensaje" v-model="queja.mensaje" @blur="tocar('mensaje')"
          rows="6" placeholder="Describa con exactitud y claridad su queja o sugerencia…"
          :class="claseInput('mensaje', errQueja) + ' resize-none'"
        />
        <p v-if="tocado['mensaje'] && errQueja['mensaje']" class="mt-1 text-xs text-red-500 dark:text-red-400">
          {{ errQueja['mensaje'] }}
        </p>
      </div>

      <button type="submit" :disabled="estado === 'enviando'"
        class="btn-primary inline-flex items-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
      >
        <svg v-if="estado === 'enviando'" class="animate-spin w-4 h-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
        </svg>
        <!-- tabler:clipboard-check -->
        <svg v-else xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
          <path d="M9 5h-2a2 2 0 0 0 -2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2 -2v-12a2 2 0 0 0 -2 -2h-2" />
          <path d="M9 5a2 2 0 0 1 2 -2h2a2 2 0 0 1 2 2a2 2 0 0 1 -2 2h-2a2 2 0 0 1 -2 -2" />
          <path d="M9 14l2 2l4 -4" />
        </svg>
        {{ estado === 'enviando' ? 'Registrando…' : 'Enviar queja o sugerencia' }}
      </button>
    </form>

  </template>
</template>
