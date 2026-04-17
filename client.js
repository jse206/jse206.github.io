/**
 * client.js
 * =========
 * Lógica principal del Power-Up "Smart Label Mover".
 *
 * Capacidades registradas:
 *   - card-buttons : Añade dos botones en el panel lateral de cada tarjeta:
 *       1. "⚙ Configurar" → abre modal.html para definir las reglas
 *       2. "▶ Aplicar reglas" → ejecuta las reglas guardadas en la tarjeta
 *
 * Flujo de datos:
 *   Las reglas se almacenan con t.set('card', 'shared', 'smartButtonRules', {...})
 *   y se recuperan con t.get('card', 'shared', 'smartButtonRules').
 *   El scope 'shared' las hace visibles a todos los miembros del tablero.
 *
 * Prerequisitos:
 *   - La API Key y el Token deben ser del usuario autenticado en Trello.
 *   - Configura TRELLO_API_KEY y TRELLO_TOKEN antes de publicar.
 */

/* ── CONFIGURACIÓN ─────────────────────────────────────────────────────────── */

// ⚠️ Sustituye estos valores por tu API Key y Token reales.
// En producción usa variables de entorno o un backend propio para no
// exponer el token en el cliente.
const TRELLO_API_KEY = 'TU_API_KEY_AQUI';
const TRELLO_TOKEN   = 'TU_TOKEN_AQUI';
const TRELLO_API_BASE = 'https://api.trello.com/1';

/* ── HELPERS DE API ────────────────────────────────────────────────────────── */

/**
 * Construye la URL completa añadiendo autenticación.
 * @param {string} path   - Ruta relativa, p. ej. '/cards/abc123/idLabels'
 * @param {Object} params - Query params adicionales
 */
function apiUrl(path, params = {}) {
  const url = new URL(TRELLO_API_BASE + path);
  url.searchParams.set('key',   TRELLO_API_KEY);
  url.searchParams.set('token', TRELLO_TOKEN);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  return url.toString();
}

/**
 * Añade una etiqueta a una tarjeta mediante la API REST de Trello.
 * POST /cards/{id}/idLabels
 * @param {string} cardId   - ID de la tarjeta
 * @param {string} labelId  - ID de la etiqueta a añadir
 */
async function addLabelToCard(cardId, labelId) {
  const resp = await fetch(apiUrl(`/cards/${cardId}/idLabels`), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ value: labelId }),
  });
  if (!resp.ok) {
    const msg = await resp.text();
    throw new Error(`addLabel failed (${resp.status}): ${msg}`);
  }
}

/**
 * Elimina una etiqueta de una tarjeta mediante la API REST de Trello.
 * DELETE /cards/{id}/idLabels/{idLabel}
 * @param {string} cardId   - ID de la tarjeta
 * @param {string} labelId  - ID de la etiqueta a eliminar
 */
async function removeLabelFromCard(cardId, labelId) {
  const resp = await fetch(apiUrl(`/cards/${cardId}/idLabels/${labelId}`), {
    method: 'DELETE',
  });
  if (!resp.ok) {
    const msg = await resp.text();
    throw new Error(`removeLabel failed (${resp.status}): ${msg}`);
  }
}

/**
 * Mueve una tarjeta a una lista diferente.
 * PUT /cards/{id}  →  campo idList
 * @param {string} cardId  - ID de la tarjeta
 * @param {string} listId  - ID de la lista destino
 */
async function moveCardToList(cardId, listId) {
  const resp = await fetch(apiUrl(`/cards/${cardId}`), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idList: listId, pos: 'bottom' }),
  });
  if (!resp.ok) {
    const msg = await resp.text();
    throw new Error(`moveCard failed (${resp.status}): ${msg}`);
  }
}

/**
 * Obtiene los datos actuales de una tarjeta (campos: id, idLabels).
 * GET /cards/{id}
 * @param {string} cardId
 */
async function fetchCard(cardId) {
  const resp = await fetch(apiUrl(`/cards/${cardId}`, { fields: 'id,idLabels,idList,name' }));
  if (!resp.ok) throw new Error(`fetchCard failed (${resp.status})`);
  return resp.json();
}

/* ── LÓGICA DE REGLAS ──────────────────────────────────────────────────────── */

/**
 * Ejecuta las reglas guardadas en una tarjeta:
 *   1. Comprueba la condición opcional (etiqueta requerida).
 *   2. Añade las etiquetas configuradas (si no las tiene ya).
 *   3. Elimina las etiquetas configuradas.
 *   4. Mueve la tarjeta a la lista de destino.
 *
 * @param {Object} t     - Instancia del SDK de Trello (TrelloPowerUp.iframe o t del callback)
 * @param {Object} rules - Reglas almacenadas: { labelsAdd, labelsRemove, targetList, condLabel }
 * @param {string} cardId
 */
async function applyRules(t, rules, cardId) {
  const { labelsAdd = [], labelsRemove = [], targetList = '', condLabel = '' } = rules;

  // Obtener estado actual de la tarjeta
  const card = await fetchCard(cardId);
  const currentLabels = card.idLabels || [];

  // ── Comprobar condición ────────────────────────────────────────────────────
  if (condLabel && !currentLabels.includes(condLabel)) {
    return t.alert({
      message: `Condición no cumplida: la tarjeta no tiene la etiqueta requerida (${condLabel}).`,
      duration: 5,
      display: 'warning',
    });
  }

  const errors = [];

  // ── Añadir etiquetas ───────────────────────────────────────────────────────
  for (const labelId of labelsAdd) {
    if (currentLabels.includes(labelId)) continue; // ya la tiene, no duplicar
    try {
      await addLabelToCard(cardId, labelId);
    } catch (e) {
      errors.push(`Añadir ${labelId}: ${e.message}`);
    }
  }

  // ── Eliminar etiquetas ─────────────────────────────────────────────────────
  for (const labelId of labelsRemove) {
    if (!currentLabels.includes(labelId)) continue; // no la tiene, nada que hacer
    try {
      await removeLabelFromCard(cardId, labelId);
    } catch (e) {
      errors.push(`Eliminar ${labelId}: ${e.message}`);
    }
  }

  // ── Mover tarjeta ──────────────────────────────────────────────────────────
  if (targetList && targetList !== card.idList) {
    try {
      await moveCardToList(cardId, targetList);
    } catch (e) {
      errors.push(`Mover tarjeta: ${e.message}`);
    }
  }

  // ── Resultado ──────────────────────────────────────────────────────────────
  if (errors.length > 0) {
    return t.alert({
      message: `Algunas operaciones fallaron:\n${errors.join('\n')}`,
      duration: 8,
      display: 'error',
    });
  }

  return t.alert({
    message: '✅ Reglas aplicadas correctamente.',
    duration: 4,
    display: 'success',
  });
}

/* ── REGISTRO DEL POWER-UP ─────────────────────────────────────────────────── */

TrelloPowerUp.initialize({

  /**
   * card-buttons
   * ─────────────
   * Define los botones que aparecen en el panel lateral de cada tarjeta.
   * Trello llama a esta función cada vez que el usuario abre una tarjeta.
   *
   * @param {Object} t        - Contexto de Trello para esta tarjeta
   * @param {Object} options  - Datos del contexto (card, board, member…)
   */
  'card-buttons': async function (t, options) {
    return [
      /* ── Botón 1: Configurar reglas ───────────────────────────────── */
      {
        icon: 'https://cdn-icons-png.flaticon.com/512/992/992700.png', // ⚙️
        text: 'Configurar botón',
        callback: function (t) {
          // Abre modal.html en un popup de Trello (300×500 px aprox.)
          return t.popup({
            title: 'Configurar reglas del botón',
            url:   './modal.html',
            height: 500,
          });
        },
      },

      /* ── Botón 2: Aplicar reglas ──────────────────────────────────── */
      {
        icon: 'https://cdn-icons-png.flaticon.com/512/1374/1374064.png', // ▶️
        text: 'Aplicar reglas',
        callback: async function (t) {
          // Recuperar las reglas guardadas en esta tarjeta
          const rules = await t.get('card', 'shared', 'smartButtonRules', null);

          if (!rules) {
            return t.alert({
              message: 'Sin configurar. Usa "Configurar botón" primero.',
              duration: 5,
              display: 'warning',
            });
          }

          // Obtener el ID de la tarjeta actual desde el contexto
          const cardId = t.getContext().card;

          // Ejecutar las reglas
          await applyRules(t, rules, cardId);
        },
      },
    ];
  },

  /**
   * on-enable
   * ─────────
   * Se ejecuta cuando un miembro habilita el Power-Up en su tablero.
   * Muestra un mensaje de bienvenida.
   */
  'on-enable': function (t) {
    return t.alert({
      message: '🎉 Smart Label Mover activado. Abre cualquier tarjeta para configurarlo.',
      duration: 6,
      display: 'info',
    });
  },

}, {
  // URL del iframe principal (este mismo archivo se sirve desde index.html)
  appKey:  TRELLO_API_KEY,
  appName: 'Smart Label Mover',
});
