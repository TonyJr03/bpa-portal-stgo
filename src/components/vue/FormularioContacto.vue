<script setup lang="ts">
/**
 * @componente  src/components/vue/FormularioContacto.vue
 * @descripcion Isla Vue para la página /contacto. Provee DOS pestañas:
 *
 *   · "Mensaje / Sugerencia": formulario ligero de 4 campos para consultas
 *     generales y retroalimentación informal.
 *
 *   · "Queja / Reclamación": formulario estructurado conforme al protocolo
 *     oficial del BPA (documento "Parámetros que se necesitan para el
 *     tratamiento a las quejas…"). Incluye motivo categorizado y nota sobre
 *     el plazo legal de respuesta (30 días hábiles).
 *
 *   Ambas pestañas guardan en la colección `mensajes_feedback` de PocketBase.
 *
 * @filosofia-de-estilos
 *   Este componente NO define su propio sistema visual. Hereda íntegramente
 *   los tokens CSS de AstroWind (--aw-color-*) a través de las clases
 *   utilitarias del proyecto: `text-default`, `text-muted`, `bg-page`,
 *   `text-primary`, `font-heading`, `btn-primary`.
 *   El contenedor exterior (padding, max-width, bg de sección) lo gestiona
 *   el WidgetWrapper en contacto.astro — no este componente.
 *
 * @coleccion   mensajes_feedback
 * @campos
 *   tipo        Text    "feedback" | "queja"
 *   nombre      Text    Nombre y apellidos del remitente
 *   correo      Email   Requerido en feedback; opcional en queja
 *   asunto      Text    Solo para tipo "feedback"
 *   mensaje     Text    Cuerpo del mensaje / detalle de la queja
 *   direccion   Text    Solo para tipo "queja"
 *   municipio   Text    Solo para tipo "queja"
 *   telefono    Text    Solo para tipo "queja"
 *   motivo      Text    Solo para tipo "queja" — catálogo oficial del DOCX
 *   leido       Bool    false por defecto — control en panel admin
 *
 * @dependencias  pocketbase  (instancia exportada desde ~/lib/pocketbase.ts)
 * @directiva     client:load
 */

import { ref, reactive, computed } from 'vue';
import { pb } from '~/lib/pocketbase';

// ── Estado de pestaña activa ─────────────────────────────────────────────────
type TabId = 'feedback' | 'queja';
const tabActiva = ref<TabId>('feedback');

// ── Estado de envío compartido ───────────────────────────────────────────────
type EstadoEnvio = 'idle' | 'enviando' | 'exito' | 'error';
const estado = ref<EstadoEnvio>('idle');
const mensajeError = ref('');

// ── Datos del formulario Feedback ────────────────────────────────────────────
const feedback = reactive({ nombre: '', correo: '', asunto: '', mensaje: '' });

// ── Datos del formulario Queja ───────────────────────────────────────────────
const queja = reactive({
  nombre: '', direccion: '', municipio: '', telefono: '', motivo: '', mensaje: '',
});

// ── Catálogos ────────────────────────────────────────────────────────────────
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

const erroresFeedback = computed(() => {
  const e: Record<string, string> = {};
  if (!feedback.nombre.trim())                    e.nombre  = 'El nombre es obligatorio.';
  if (!feedback.correo.trim())                    e.correo  = 'El correo es obligatorio.';
  else if (!reEmail.test(feedback.correo.trim())) e.correo  = 'Ingrese un correo válido.';
  if (!feedback.asunto.trim())                    e.asunto  = 'El asunto es obligatorio.';
  if (!feedback.mensaje.trim())                   e.mensaje = 'El mensaje no puede estar vacío.';
  return e;
});

const erroresQueja = computed(() => {
  const e: Record<string, string> = {};
  if (!queja.nombre.trim())  e.nombre    = 'El nombre y apellidos son obligatorios.';
  if (!queja.municipio)      e.municipio = 'Seleccione el municipio.';
  if (!queja.motivo)         e.motivo    = 'Seleccione el motivo de la reclamación.';
  if (!queja.mensaje.trim()) e.mensaje   = 'Detalle su queja o sugerencia.';
  return e;
});

// Registro de campos tocados: muestra el error solo tras interacción del usuario
const formTocado = reactive<Record<string, boolean>>({});
function tocar(campo: string) { formTocado[campo] = true; }

// ── Envío Feedback ────────────────────────────────────────────────────────────
async function enviarFeedback() {
  ['nombre', 'correo', 'asunto', 'mensaje'].forEach(c => (formTocado[c] = true));
  if (Object.keys(erroresFeedback.value).length) return;
  estado.value = 'enviando';
  try {
    await pb.collection('mensajes_feedback').create({
      tipo: 'feedback', nombre: feedback.nombre.trim(), correo: feedback.correo.trim(),
      asunto: feedback.asunto.trim(), mensaje: feedback.mensaje.trim(), leido: false,
    });
    estado.value = 'exito';
    Object.assign(feedback, { nombre: '', correo: '', asunto: '', mensaje: '' });
    Object.keys(formTocado).forEach(k => delete formTocado[k]);
  } catch (err: unknown) {
    estado.value = 'error';
    mensajeError.value = err instanceof Error ? err.message : 'No se pudo enviar. Intente más tarde.';
  }
}

// ── Envío Queja ───────────────────────────────────────────────────────────────
async function enviarQueja() {
  ['nombre', 'municipio', 'motivo', 'mensaje'].forEach(c => (formTocado[c] = true));
  if (Object.keys(erroresQueja.value).length) return;
  estado.value = 'enviando';
  try {
    await pb.collection('mensajes_feedback').create({
      tipo: 'queja', nombre: queja.nombre.trim(), direccion: queja.direccion.trim(),
      municipio: queja.municipio, telefono: queja.telefono.trim(),
      motivo: queja.motivo, mensaje: queja.mensaje.trim(), leido: false,
    });
    estado.value = 'exito';
    Object.assign(queja, { nombre: '', direccion: '', municipio: '', telefono: '', motivo: '', mensaje: '' });
    Object.keys(formTocado).forEach(k => delete formTocado[k]);
  } catch (err: unknown) {
    estado.value = 'error';
    mensajeError.value = err instanceof Error ? err.message : 'No se pudo enviar. Intente más tarde.';
  }
}

function reintentar() { estado.value = 'idle'; mensajeError.value = ''; }

function cambiarTab(tab: TabId) {
  tabActiva.value = tab;
  estado.value = 'idle';
  mensajeError.value = '';
  Object.keys(formTocado).forEach(k => delete formTocado[k]);
}
</script>

<template>
  <!--
    Layout interno: 2 columnas en desktop (formulario | panel lateral).
    El padding exterior, max-width y bg de sección los define el WidgetWrapper
    en contacto.astro. Este componente solo gestiona su contenido interno.
  -->
  <div class="grid grid-cols-1 lg:grid-cols-3 gap-10 lg:gap-14 items-start">

    <!-- ════════════════════════════════════════════════════════════════════
         COLUMNA IZQUIERDA — Formulario con pestañas (2/3 del ancho)
    ════════════════════════════════════════════════════════════════════ -->
    <div class="lg:col-span-2">

      <!-- Cabecera ───────────────────────────────────────────────────── -->
      <div class="mb-6">
        <h2 class="text-2xl font-bold font-heading text-default dark:text-white">
          Escríbanos
        </h2>
        <p class="mt-1 text-muted text-sm">
          Seleccione el tipo de comunicación que desea enviarnos.
        </p>
      </div>

      <!-- Pestañas ───────────────────────────────────────────────────── -->
      <div
        class="flex border-b border-gray-200 dark:border-slate-700 mb-7"
        role="tablist"
      >
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
          <!-- Icono: mensaje -->
          <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M7 8h10M7 12h6m-6 4h10M3 4h18a1 1 0 011 1v13a1 1 0 01-1 1H3a1 1 0 01-1-1V5a1 1 0 011-1z"/>
          </svg>
          Mensaje o Sugerencia
        </button>

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
          <!-- Icono: reclamación -->
          <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M9 12h6m-3-3v6m-7 4h14a2 2 0 002-2V7l-5-5H5a2 2 0 00-2 2v14a2 2 0 002 2z"/>
          </svg>
          Queja o Reclamación
        </button>
      </div>

      <!-- ── ESTADO: ÉXITO ─────────────────────────────────────────────── -->
      <div
        v-if="estado === 'exito'"
        class="flex flex-col items-center justify-center text-center py-16 px-6 rounded-xl border border-green-200 dark:border-green-700 bg-green-50 dark:bg-green-900/20"
      >
        <svg xmlns="http://www.w3.org/2000/svg" class="w-14 h-14 text-green-500 dark:text-green-400 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
          <path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
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
            Su reclamación ha quedado registrada oficialmente. Tiene derecho a
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

      <!-- ── ESTADO: ERROR ─────────────────────────────────────────────── -->
      <div
        v-else-if="estado === 'error'"
        class="flex flex-col items-center justify-center text-center py-12 px-6 rounded-xl border border-red-200 dark:border-red-700 bg-red-50 dark:bg-red-900/20"
      >
        <svg xmlns="http://www.w3.org/2000/svg" class="w-12 h-12 text-red-400 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
          <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
        </svg>
        <h3 class="text-lg font-bold font-heading text-red-700 dark:text-red-400 mb-1">
          Error al enviar
        </h3>
        <p class="text-muted text-sm mb-4">{{ mensajeError }}</p>
        <button
          @click="reintentar"
          class="text-sm font-semibold text-red-700 dark:text-red-400 underline hover:no-underline"
        >
          Intentar de nuevo
        </button>
      </div>

      <!-- ── FORMULARIOS (estado idle / enviando) ──────────────────────── -->
      <template v-else>

        <!-- ╔══════════════════════════════════════════════════════════╗
             ║  TAB 1 · Mensaje / Sugerencia                           ║
             ╚══════════════════════════════════════════════════════════╝ -->
        <form
          v-if="tabActiva === 'feedback'"
          @submit.prevent="enviarFeedback"
          novalidate
          class="space-y-5"
        >
          <!-- Nombre -->
          <div>
            <label for="fb-nombre" class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              Nombre completo <span class="text-red-500">*</span>
            </label>
            <input
              id="fb-nombre" v-model="feedback.nombre" @blur="tocar('nombre')"
              type="text" autocomplete="name" placeholder="Ej: Juan García Pérez"
              :class="[
                'w-full rounded-lg border px-4 py-2.5 text-sm transition',
                'bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200',
                'placeholder:text-slate-400 dark:placeholder:text-slate-500',
                'focus:outline-none focus:ring-2',
                (formTocado['nombre'] && erroresFeedback['nombre'])
                  ? 'border-red-400 dark:border-red-500 focus:ring-red-300/50 bg-red-50 dark:bg-red-900/20'
                  : 'border-gray-300 dark:border-slate-600 focus:ring-primary/40',
              ]"
            />
            <p v-if="formTocado['nombre'] && erroresFeedback['nombre']" class="mt-1 text-xs text-red-500 dark:text-red-400">
              {{ erroresFeedback['nombre'] }}
            </p>
          </div>

          <!-- Correo -->
          <div>
            <label for="fb-correo" class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              Correo electrónico <span class="text-red-500">*</span>
            </label>
            <input
              id="fb-correo" v-model="feedback.correo" @blur="tocar('correo')"
              type="email" autocomplete="email" placeholder="ejemplo@correo.cu"
              :class="[
                'w-full rounded-lg border px-4 py-2.5 text-sm transition',
                'bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200',
                'placeholder:text-slate-400 dark:placeholder:text-slate-500',
                'focus:outline-none focus:ring-2',
                (formTocado['correo'] && erroresFeedback['correo'])
                  ? 'border-red-400 dark:border-red-500 focus:ring-red-300/50 bg-red-50 dark:bg-red-900/20'
                  : 'border-gray-300 dark:border-slate-600 focus:ring-primary/40',
              ]"
            />
            <p v-if="formTocado['correo'] && erroresFeedback['correo']" class="mt-1 text-xs text-red-500 dark:text-red-400">
              {{ erroresFeedback['correo'] }}
            </p>
          </div>

          <!-- Asunto -->
          <div>
            <label for="fb-asunto" class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              Asunto <span class="text-red-500">*</span>
            </label>
            <input
              id="fb-asunto" v-model="feedback.asunto" @blur="tocar('asunto')"
              type="text" placeholder="Resumen breve de su consulta"
              :class="[
                'w-full rounded-lg border px-4 py-2.5 text-sm transition',
                'bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200',
                'placeholder:text-slate-400 dark:placeholder:text-slate-500',
                'focus:outline-none focus:ring-2',
                (formTocado['asunto'] && erroresFeedback['asunto'])
                  ? 'border-red-400 dark:border-red-500 focus:ring-red-300/50 bg-red-50 dark:bg-red-900/20'
                  : 'border-gray-300 dark:border-slate-600 focus:ring-primary/40',
              ]"
            />
            <p v-if="formTocado['asunto'] && erroresFeedback['asunto']" class="mt-1 text-xs text-red-500 dark:text-red-400">
              {{ erroresFeedback['asunto'] }}
            </p>
          </div>

          <!-- Mensaje -->
          <div>
            <label for="fb-mensaje" class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              Mensaje <span class="text-red-500">*</span>
            </label>
            <textarea
              id="fb-mensaje" v-model="feedback.mensaje" @blur="tocar('mensaje')"
              rows="5" placeholder="Describa su consulta o sugerencia con el mayor detalle posible…"
              :class="[
                'w-full rounded-lg border px-4 py-2.5 text-sm resize-none transition',
                'bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200',
                'placeholder:text-slate-400 dark:placeholder:text-slate-500',
                'focus:outline-none focus:ring-2',
                (formTocado['mensaje'] && erroresFeedback['mensaje'])
                  ? 'border-red-400 dark:border-red-500 focus:ring-red-300/50 bg-red-50 dark:bg-red-900/20'
                  : 'border-gray-300 dark:border-slate-600 focus:ring-primary/40',
              ]"
            />
            <p v-if="formTocado['mensaje'] && erroresFeedback['mensaje']" class="mt-1 text-xs text-red-500 dark:text-red-400">
              {{ erroresFeedback['mensaje'] }}
            </p>
          </div>

          <button type="submit" :disabled="estado === 'enviando'"
            class="btn-primary inline-flex items-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            <svg v-if="estado === 'enviando'" class="animate-spin w-4 h-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
            </svg>
            <svg v-else xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"/>
            </svg>
            {{ estado === 'enviando' ? 'Enviando…' : 'Enviar mensaje' }}
          </button>
        </form>

        <!-- ╔══════════════════════════════════════════════════════════╗
             ║  TAB 2 · Queja / Reclamación formal                     ║
             ╚══════════════════════════════════════════════════════════╝ -->
        <form
          v-else-if="tabActiva === 'queja'"
          @submit.prevent="enviarQueja"
          novalidate
          class="space-y-5"
        >
          <!-- Aviso: plazo legal -->
          <div class="flex gap-3 p-4 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 text-sm text-blue-800 dark:text-blue-300">
            <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5 shrink-0 mt-0.5 text-blue-500 dark:text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M13 16h-1v-4h-1m1-4h.01M12 2a10 10 0 100 20A10 10 0 0012 2z"/>
            </svg>
            <span>
              Complete los datos con exactitud y claridad. Tiene derecho a recibir
              respuesta formal en <strong>30 días hábiles</strong> a partir del registro
              de su reclamación.
            </span>
          </div>

          <!-- Nombre y apellidos -->
          <div>
            <label for="qj-nombre" class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              Nombre y apellidos <span class="text-red-500">*</span>
            </label>
            <input
              id="qj-nombre" v-model="queja.nombre" @blur="tocar('nombre')"
              type="text" autocomplete="name" placeholder="Ej: María López Domínguez"
              :class="[
                'w-full rounded-lg border px-4 py-2.5 text-sm transition',
                'bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200',
                'placeholder:text-slate-400 dark:placeholder:text-slate-500',
                'focus:outline-none focus:ring-2',
                (formTocado['nombre'] && erroresQueja['nombre'])
                  ? 'border-red-400 dark:border-red-500 focus:ring-red-300/50 bg-red-50 dark:bg-red-900/20'
                  : 'border-gray-300 dark:border-slate-600 focus:ring-primary/40',
              ]"
            />
            <p v-if="formTocado['nombre'] && erroresQueja['nombre']" class="mt-1 text-xs text-red-500 dark:text-red-400">
              {{ erroresQueja['nombre'] }}
            </p>
          </div>

          <!-- Dirección + Municipio -->
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label for="qj-direccion" class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                Dirección
              </label>
              <input
                id="qj-direccion" v-model="queja.direccion" type="text"
                placeholder="Calle, número, reparto…"
                class="w-full rounded-lg border border-gray-300 dark:border-slate-600 px-4 py-2.5 text-sm bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-primary/40 transition"
              />
            </div>
            <div>
              <label for="qj-municipio" class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                Municipio <span class="text-red-500">*</span>
              </label>
              <select
                id="qj-municipio" v-model="queja.municipio" @blur="tocar('municipio')"
                :class="[
                  'w-full rounded-lg border px-4 py-2.5 text-sm appearance-none transition',
                  'bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200',
                  'focus:outline-none focus:ring-2',
                  (formTocado['municipio'] && erroresQueja['municipio'])
                    ? 'border-red-400 dark:border-red-500 focus:ring-red-300/50 bg-red-50 dark:bg-red-900/20'
                    : 'border-gray-300 dark:border-slate-600 focus:ring-primary/40',
                ]"
              >
                <option value="" disabled>Seleccione…</option>
                <option v-for="m in municipiosSCU" :key="m" :value="m">{{ m }}</option>
              </select>
              <p v-if="formTocado['municipio'] && erroresQueja['municipio']" class="mt-1 text-xs text-red-500 dark:text-red-400">
                {{ erroresQueja['municipio'] }}
              </p>
            </div>
          </div>

          <!-- Teléfono -->
          <div>
            <label for="qj-telefono" class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              Teléfono de contacto
            </label>
            <input
              id="qj-telefono" v-model="queja.telefono" type="tel" autocomplete="tel"
              placeholder="Ej: (022) 65-XXXX"
              class="w-full rounded-lg border border-gray-300 dark:border-slate-600 px-4 py-2.5 text-sm bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-primary/40 transition"
            />
          </div>

          <!-- Motivo categorizado (catálogo oficial del DOCX) -->
          <div>
            <label for="qj-motivo" class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              Motivo de la reclamación <span class="text-red-500">*</span>
            </label>
            <select
              id="qj-motivo" v-model="queja.motivo" @blur="tocar('motivo')"
              :class="[
                'w-full rounded-lg border px-4 py-2.5 text-sm appearance-none transition',
                'bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200',
                'focus:outline-none focus:ring-2',
                (formTocado['motivo'] && erroresQueja['motivo'])
                  ? 'border-red-400 dark:border-red-500 focus:ring-red-300/50 bg-red-50 dark:bg-red-900/20'
                  : 'border-gray-300 dark:border-slate-600 focus:ring-primary/40',
              ]"
            >
              <option value="" disabled>Seleccione el motivo…</option>
              <option v-for="m in motivosQueja" :key="m" :value="m">{{ m }}</option>
            </select>
            <p v-if="formTocado['motivo'] && erroresQueja['motivo']" class="mt-1 text-xs text-red-500 dark:text-red-400">
              {{ erroresQueja['motivo'] }}
            </p>
          </div>

          <!-- Descripción detallada -->
          <div>
            <label for="qj-mensaje" class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              Descripción detallada <span class="text-red-500">*</span>
            </label>
            <textarea
              id="qj-mensaje" v-model="queja.mensaje" @blur="tocar('mensaje')"
              rows="6" placeholder="Describa los hechos con exactitud y claridad: cuándo ocurrió, en qué sucursal, qué trámite realizaba…"
              :class="[
                'w-full rounded-lg border px-4 py-2.5 text-sm resize-none transition',
                'bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200',
                'placeholder:text-slate-400 dark:placeholder:text-slate-500',
                'focus:outline-none focus:ring-2',
                (formTocado['mensaje'] && erroresQueja['mensaje'])
                  ? 'border-red-400 dark:border-red-500 focus:ring-red-300/50 bg-red-50 dark:bg-red-900/20'
                  : 'border-gray-300 dark:border-slate-600 focus:ring-primary/40',
              ]"
            />
            <p v-if="formTocado['mensaje'] && erroresQueja['mensaje']" class="mt-1 text-xs text-red-500 dark:text-red-400">
              {{ erroresQueja['mensaje'] }}
            </p>
          </div>

          <button type="submit" :disabled="estado === 'enviando'"
            class="btn-primary inline-flex items-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            <svg v-if="estado === 'enviando'" class="animate-spin w-4 h-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
            </svg>
            <svg v-else xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m7-4H5a2 2 0 00-2 2v11a2 2 0 002-2V9a2 2 0 00-2-2z"/>
            </svg>
            {{ estado === 'enviando' ? 'Registrando…' : 'Registrar reclamación' }}
          </button>
        </form>

      </template>
      <!-- Fin formularios -->

    </div>
    <!-- Fin columna izquierda -->

    <!-- ════════════════════════════════════════════════════════════════════
         COLUMNA DERECHA — Panel informativo (1/3 del ancho en desktop)
         lg:pt-16 alinea visualmente la tarjeta con el inicio del formulario,
         debajo de la cabecera "Escríbanos" + las pestañas.
    ════════════════════════════════════════════════════════════════════ -->
    <aside class="space-y-5 lg:pt-16">

      <!-- Card: datos de contacto rápido ─────────────────────────────── -->
      <div class="rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-6">
        <h3 class="text-base font-semibold font-heading text-slate-800 dark:text-slate-200 mb-4 flex items-center gap-2">
          <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5 text-primary shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M3 21h18M9 21V7l6-4v18M9 11h6M9 15h6"/>
          </svg>
          Sede Provincial
        </h3>
        <ul class="space-y-3.5 text-sm text-slate-600 dark:text-slate-400">
          <!-- Dirección -->
          <li class="flex gap-3">
            <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4 mt-0.5 shrink-0 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M17.657 16.657L13.414 20.9a2 2 0 01-2.828 0l-4.243-4.243a8 8 0 1111.314 0z"/>
              <path stroke-linecap="round" stroke-linejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"/>
            </svg>
            <span>[COMPLETAR: Calle, número, entre calles, Santiago de Cuba]</span>
          </li>
          <!-- Teléfonos -->
          <li class="flex gap-3">
            <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4 mt-0.5 shrink-0 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"/>
            </svg>
            <span>
              Recepción: <strong class="text-slate-700 dark:text-slate-300">[COMPLETAR]</strong><br/>
              Atención al Cliente: <strong class="text-slate-700 dark:text-slate-300">[COMPLETAR]</strong>
            </span>
          </li>
          <!-- Correo -->
          <li class="flex gap-3">
            <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4 mt-0.5 shrink-0 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/>
            </svg>
            <span>[COMPLETAR: atencion@bpa.scu.cu]</span>
          </li>
          <!-- Horario -->
          <li class="flex gap-3">
            <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4 mt-0.5 shrink-0 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2" fill="none"/>
              <path stroke-linecap="round" stroke-linejoin="round" d="M12 6v6l4 2"/>
            </svg>
            <span>
              Lunes a Viernes<br/>
              <strong class="text-slate-700 dark:text-slate-300">[COMPLETAR: 8:00 am – 4:00 pm]</strong>
            </span>
          </li>
        </ul>
      </div>

      <!-- Card: nota sobre plazo de respuesta ─────────────────────────── -->
      <div class="rounded-xl border border-amber-200 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 p-5 text-sm text-amber-800 dark:text-amber-300">
        <p class="font-semibold mb-1 flex items-center gap-2">
          <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01M12 2a10 10 0 100 20A10 10 0 0012 2z"/>
          </svg>
          Plazo de respuesta
        </p>
        <p>
          Las reclamaciones formales tienen garantizado un plazo máximo de
          <strong>30 días hábiles</strong>. Si no recibe contestación, puede escalar
          directamente a la Dirección Provincial.
        </p>
      </div>

      <!-- Enlace a canales de atención ───────────────────────────────── -->
      <a
        href="/sobre-nosotros/nuestra-red/canales-de-atencion"
        class="flex items-center gap-2 text-sm font-medium text-primary hover:underline"
      >
        <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6"/>
        </svg>
        Ver todos los canales de atención
      </a>

    </aside>
    <!-- Fin columna derecha -->

  </div>
</template>
