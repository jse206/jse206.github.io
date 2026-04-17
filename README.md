# Smart Label Mover – Power-Up de Trello

Botón personalizable por tarjeta que añade/quita etiquetas y mueve la tarjeta a otra lista, todo sin salir de Trello.

---

## Estructura del proyecto

```
trello-powerup/
├── index.html       ← Punto de entrada (Trello lo carga en iframe oculto)
├── card-button.html ← iframe auxiliar del botón
├── modal.html       ← Interfaz de configuración por tarjeta
├── client.js        ← Lógica principal del Power-Up
├── styles.css       ← Estilos del modal
└── README.md
```

---

## Configuración previa

### 1. Credenciales de Trello

Edita `client.js` y sustituye:

```js
const TRELLO_API_KEY = 'TU_API_KEY_AQUI';
const TRELLO_TOKEN   = 'TU_TOKEN_AQUI';
```

Obtén tus credenciales en: https://trello.com/app-key

> ⚠️ **Seguridad:** En producción, mueve el token a un backend propio
> para no exponerlo en el código cliente.

---

## Publicar el Power-Up (GitHub Pages – gratis)

1. Crea un repositorio en GitHub (puede ser privado o público).
2. Sube todos los archivos a la rama `main`.
3. Ve a **Settings → Pages → Branch: main → /root → Save**.
4. Tu URL base será:
   ```
   https://TU_USUARIO.github.io/NOMBRE_REPO/
   ```

---

## Registrar el Power-Up en Trello

1. Abre: https://trello.com/power-ups/admin
2. Pulsa **"Create new Power-Up"**.
3. Rellena:
   | Campo | Valor |
   |---|---|
   | Name | Smart Label Mover |
   | Iframe connector URL | `https://TU_USUARIO.github.io/NOMBRE_REPO/index.html` |
   | Capabilities | `card-buttons` |
4. Pulsa **Save**.

---

## Activar el Power-Up en tu tablero

1. Abre el tablero en Trello.
2. Menú → **Power-Ups → Add Power-Ups**.
3. Busca "Smart Label Mover" (aparecerá en "Custom" o "By you").
4. Actívalo.

---

## Uso

### Configurar reglas en una tarjeta

1. Abre cualquier tarjeta del tablero.
2. En el panel lateral aparecerán dos botones:
   - **⚙ Configurar botón** → abre el modal de configuración
   - **▶ Aplicar reglas** → ejecuta las reglas guardadas

3. En el modal define:
   - IDs de etiquetas a **añadir** (separados por coma)
   - IDs de etiquetas a **eliminar**
   - **Lista de destino** (selecciona del desplegable)
   - **Condición opcional**: solo ejecuta si la tarjeta ya tiene cierta etiqueta

### Obtener el ID de una etiqueta

Las etiquetas no muestran su ID en la UI de Trello. Usa el script Python
adjunto (`trello_api.py`) o la llamada directa:

```
GET https://api.trello.com/1/boards/{BOARD_ID}/labels?key=...&token=...
```

---

## Integración con automatizaciones de Trello

El Power-Up funciona junto con el sistema de automatizaciones nativo de Trello (Butler):

1. Ve a **Automatizaciones** en el menú del tablero.
2. Crea una regla del tipo **"Cuando se pulsa el botón de tarjeta del Power-Up..."**  
   (aparece como opción cuando el Power-Up está activo).
3. Añade las acciones adicionales que quieras encadenar: mover, notificar, etc.

Esto permite combinar la lógica del Power-Up con las automatizaciones nativas
sin necesidad de código adicional.

---

## Solución de problemas

| Síntoma | Causa probable | Solución |
|---|---|---|
| El botón no aparece | Power-Up no activado en el tablero | Actívalo desde el menú Power-Ups |
| "Error 401" al aplicar | Token inválido o expirado | Genera un nuevo token en trello.com/app-key |
| Modal no carga | URL del iframe incorrecta | Verifica que la URL en el registro coincida con tu dominio |
| Etiqueta no se añade | ID de etiqueta incorrecto | Consulta los IDs via API con GET /boards/{id}/labels |
