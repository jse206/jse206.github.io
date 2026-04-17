/**
 * client.js – Smart Label Mover (v2, corregido)
 * ================================================
 * Lógica principal del Power-Up.
 *
 * Correcciones respecto a v1:
 *   - card-buttons NO es async: el SDK de Trello requiere que devuelva
 *     un array directamente, no una Promise. Si devuelve una Promise,
 *     Trello ignora el resultado y no muestra ningún botón.
 *   - Iconos SVG inline en base64 para evitar dependencias externas
 *     (algunos dominios externos son bloqueados por la CSP de Trello).
 *   - Eliminado el segundo argumento de initialize() con `appKey`,
 *     que sobreescribía el appKey correcto y causaba errores de autenticación.
 *   - t.alert() reemplazado por t.popup() con página de resultado, ya que
 *     t.alert() no existe en el SDK público de Trello Power-Ups.
 *   - Uso de t.getContext() correctamente para obtener el cardId.
 */

/* ── CONFIGURACIÓN ─────────────────────────────────────────────────────────── */

// ⚠️  Sustituye por tu API Key y Token reales antes de publicar.
// Consíguelos en: https://trello.com/app-key
const TRELLO_API_KEY  = 'TU_API_KEY_AQUI';
const TRELLO_TOKEN    = 'TU_TOKEN_AQUI';
const TRELLO_API_BASE = 'https://api.trello.com/1';

/* ── ICONOS (SVG en data URI para evitar problemas de CSP) ─────────────────── */

// Icono de engranaje para el botón "Configurar"
const ICON_SETTINGS = 'data:image/svg+xml;utf8,' + encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
     stroke="%23172B4D" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <circle cx="12" cy="12" r="3"/>
  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06
           a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09
           A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83
           l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09
           A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83
           l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09
           a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83
           l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09
           a1.65 1.65 0 0 0-1.51 1z"/>
</svg>`);

// Icono de rayo para el botón "Aplicar reglas"
const ICON_APPLY = 'data:image/svg+xml;utf8,' + encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
     stroke="%23172B4D" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
</svg>`);

/* ── HELPERS DE API REST ────────────────────────────────────────────────────── */

function apiUrl(path, params = {}) {
  const url = new URL(TRELLO_API_BASE + path);
  url.searchParams.set('key',   TRELLO_API_KEY);
  url.searchParams.set('token', TRELLO_TOKEN);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  return url.toString();
}

async function fetchCard(cardId) {
  const resp = await fetch(apiUrl(`/cards/${cardId}`, { fields: 'id,idLabels,idList,name' }));
  if (!resp.ok) throw new Error(`fetchCard ${resp.status}`);
  return resp.json();
}

async function addLabelToCard(cardId, labelId) {
  const resp = await fetch(apiUrl(`/cards/${cardId}/idLabels`), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ value: labelId }),
  });
  if (!resp.ok) {
    const msg = await resp.text();
    throw new Error(`addLabel (${resp.status}): ${msg}`);
  }
}

async function removeLabelFromCard(cardId, labelId) {
  const resp = await fetch(apiUrl(`/cards/${cardId}/idLabels/${labelId}`), {
    method: 'DELETE',
  });
  if (!resp.ok) {
    const msg = await resp.text();
    throw new Error(`removeLabel (${resp.status}): ${msg}`);
  }
}

async function moveCardToList(cardId, listId) {
  const resp = await fetch(apiUrl(`/cards/${cardId}`), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idList: listId, pos: 'bottom' }),
  });
  if (!resp.ok) {
    const msg = await resp.text();
    throw new Error(`moveCard (${resp.status}): ${msg}`);
  }
}

/* ── LÓGICA DE REGLAS ──────────────────────────────────────────────────────── */

async function applyRules(t, rules, cardId) {
  const { labelsAdd = [], labelsRemove = [], targetList = '', condLabel = '' } = rules;

  let card;
  try {
    card = await fetchCard(cardId);
  } catch (e) {
    return t.popup({
      title: 'Error',
      url: buildResultUrl('❌ No se pudo leer la tarjeta: ' + e.message),
      height: 100,
    });
  }

  const currentLabels = card.idLabels || [];

  // ── Condición opcional ────────────────────────────────────────────────────
  if (condLabel && !currentLabels.includes(condLabel)) {
    return t.popup({
      title: 'Condición no cumplida',
      url: buildResultUrl('⚠️ La tarjeta no tiene la etiqueta requerida como condición.'),
      height: 100,
    });
  }

  const errors = [];

  // ── Añadir etiquetas ───────────────────────────────────────────────────────
  for (const labelId of labelsAdd) {
    if (!labelId || currentLabels.includes(labelId)) continue;
    try { await addLabelToCard(cardId, labelId); }
    catch (e) { errors.push('Añadir ' + labelId + ': ' + e.message); }
  }

  // ── Eliminar etiquetas ─────────────────────────────────────────────────────
  for (const labelId of labelsRemove) {
    if (!labelId || !currentLabels.includes(labelId)) continue;
    try { await removeLabelFromCard(cardId, labelId); }
    catch (e) { errors.push('Eliminar ' + labelId + ': ' + e.message); }
  }

  // ── Mover tarjeta ──────────────────────────────────────────────────────────
  if (targetList && targetList !== card.idList) {
    try { await moveCardToList(cardId, targetList); }
    catch (e) { errors.push('Mover tarjeta: ' + e.message); }
  }

  const msg = errors.length > 0
    ? '❌ Errores: ' + errors.join(' | ')
    : '✅ Reglas aplicadas correctamente.';

  return t.popup({ title: 'Resultado', url: buildResultUrl(msg), height: 100 });
}

/**
 * Construye la URL de result.html con el mensaje como query param.
 * Usamos una página HTML mínima para mostrar resultados, ya que
 * t.alert() no existe en la API pública del SDK.
 */
function buildResultUrl(message) {
  return './result.html?msg=' + encodeURIComponent(message);
}

/* ── REGISTRO DEL POWER-UP ─────────────────────────────────────────────────── */

TrelloPowerUp.initialize({

  /**
   * card-buttons
   * ─────────────
   * IMPORTANTE: esta función debe ser SÍNCRONA y devolver un array directamente.
   * Si es async o devuelve una Promise, Trello no procesa el resultado
   * y el botón no aparece. Los callbacks individuales SÍ pueden ser async.
   */
  'card-buttons': function (t, options) {
    return [
      {
        icon: ICON_SETTINGS,
        text: 'Configurar botón',
        callback: function (t) {
          return t.popup({
            title: 'Configurar reglas',
            url:   './modal.html',
            height: 520,
          });
        },
      },
      {
        icon: ICON_APPLY,
        text: 'Aplicar reglas',
        // El callback interno SÍ puede ser async
        callback: async function (t) {
          const rules  = await t.get('card', 'shared', 'smartButtonRules', null);
          const cardId = t.getContext().card;

          if (!rules) {
            return t.popup({
              title: 'Sin configurar',
              url:   buildResultUrl('⚠️ Usa "Configurar botón" primero para definir las reglas.'),
              height: 100,
            });
          }

          await applyRules(t, rules, cardId);
        },
      },
    ];
  },

  'on-enable': function (t) {
    // on-enable no tiene método de alerta; simplemente abre el popup de bienvenida
    return t.popup({
      title: 'Smart Label Mover activado',
      url:   buildResultUrl('✅ Power-Up activado. Abre una tarjeta y pulsa "Configurar botón".'),
      height: 100,
    });
  },

});
