# 🚀 Updev Status  ![VS Code Marketplace Version](https://img.shields.io/visual-studio-marketplace/v/mateoburbanodev.updev-status)

**Updev Status** es una extensión de **VS Code** que añade un botón dinámico en la **barra de estado** para mantener tu rama sincronizada con `develop` (o la rama que elijas), detectar **conflictos de merge** y ayudarte a resolverlos de forma rápida y visual.

Pensada para equipos que trabajan con **feature branches + develop** y quieren reducir fricción, errores y comandos repetitivos.

---

## ⚡ TL;DR

- 🔀 Botón en la barra de estado para hacer *updev*
- ⚠️ Detecta conflictos automáticamente
- 📂 Te guía para resolverlos (Quick Pick / SCM)
- ⌨️ Atajos de teclado configurables
- 🚀 Puede sugerir o hacer `git push` tras un merge limpio
- 🧩 Funciona en workspaces con varios repos
- 🔐 Seguro por defecto (no hace push si hay conflictos)

---

## ✨ Características

- 🔀 Botón **updev** en la barra de estado
- ⚠️ Detección automática de **conflictos de merge**
- 🧠 Cambio dinámico de estado:
  - `updev` → repositorio limpio
  - `conflicts` → conflictos pendientes
- 📂 **Quick Pick** para conflictos:
  - abrir un archivo concreto
  - o **abrir todos** los archivos en conflicto
- ⌨️ **Atajos de teclado configurables**
- 🚀 **Push automático o sugerido** tras un updev exitoso
- 🧩 Compatible con **workspaces multi-repo**
- 📌 Usa siempre el **repo del archivo activo**
- 📦 No requiere scripts ni configuración en el repositorio
- 🪄 Script de Git embebido en la extensión (autocontenido)

---

## 🧭 Cómo funciona

### Estado limpio
Cuando no hay conflictos:
- El botón muestra:  
  **🔀 updev**
- Al ejecutar (click o atajo):
  - actualiza la rama base
  - vuelve a tu rama
  - hace **merge**
  - opcionalmente **sugiere o ejecuta `git push`**

### Con conflictos
Cuando hay conflictos:
- El botón muestra:  
  **⚠️ conflicts**
- Al ejecutar:
  - abre **Source Control**
  - muestra un selector para abrir archivos en conflicto

---

## 🛠️ Flujo de Git que ejecuta

De forma simplificada:

1. `git fetch <remote>`
2. Actualiza la rama base
3. Vuelve a tu rama actual
4. `git pull --ff-only`
5. `git merge <base>`
6. Si no hay conflictos:
   - sugiere o ejecuta `git push`

> No usa rebase por defecto. Es un **merge explícito y seguro**.

---

## ⌨️ Comandos y atajos

### Comandos
- **Updev Status: Ejecutar updev**
- **Updev Status: Resolver conflictos**
- **Updev Status: Configurar atajos de teclado**

### Atajos por defecto
- Ejecutar updev  
  - Windows/Linux: `Ctrl + Alt + U`  
  - macOS: `Cmd + Alt + U`
- Resolver conflictos  
  - Windows/Linux: `Ctrl + Alt + Shift + U`  
  - macOS: `Cmd + Alt + Shift + U`

👉 Los atajos pueden cambiarse desde  
**Preferences → Keyboard Shortcuts** buscando *Updev Status*.

---

## ⚙️ Configuración

Todas las opciones son **opcionales** y se definen en **User Settings**  
(`Settings → Open Settings (JSON)`).

Ejemplo completo:

```json
{
  "updevStatus.baseBranch": "develop",
  "updevStatus.remoteName": "origin",
  "updevStatus.refreshIntervalMs": 3000,
  "updevStatus.onConflictsRun": "quickPick",
  "updevStatus.afterUpdev": "suggestPush"
}
