# 🚀 Updev Status ![VS Code Marketplace Version](https://img.shields.io/visual-studio-marketplace/v/mateoburbanodev.updev-status)

**Updev Status** es una extensión de **VS Code** que añade un botón dinámico en la **barra de estado** para mantener tu rama sincronizada con `develop` (o la rama que quieras), detectando y ayudando a resolver **conflictos de merge** de forma visual y rápida.

Pensada para equipos que trabajan con **feature branches + develop** y quieren reducir fricción al actualizar ramas.

---

## ✨ Características

- 🔀 Botón **updev** en la barra de estado
- ⚠️ Detección automática de **conflictos de merge**
- 🧠 Cambio dinámico de estado:
  - `updev` → repo limpio
  - `conflicts` → conflictos pendientes
- 📂 **Quick Pick** para conflictos:
  - abrir un archivo concreto
  - o **abrir todos** los archivos en conflicto
- 🧩 Compatible con **workspaces multi-repo**
- 📌 Usa el **repo del archivo activo**
- 📦 No requiere scripts ni configuración en el repo
- 🪄 Script de Git embebido en la extensión

---

## 🧭 Cómo funciona

### Estado limpio
Cuando no hay conflictos:
- El botón muestra:  
  **🔀 updev**
- Al hacer click:
  - actualiza la rama base (`develop`)
  - vuelve a tu rama
  - hace **merge** de la base en tu rama

### Con conflictos
Cuando hay conflictos:
- El botón muestra:  
  **⚠️ conflicts**
- Al hacer click:
  - abre **Source Control**
  - muestra un **selector** con:
    - 📂 Abrir todos los archivos en conflicto
    - 📄 Abrir un archivo concreto

---

## 🛠️ Flujo de Git que ejecuta

De forma simplificada:

1. `git fetch <remote>`
2. Actualiza la rama base (`develop`)
3. Vuelve a tu rama actual
4. `git merge develop`
5. Si hay conflictos → Git se detiene (flujo estándar)

> No usa rebase por defecto. Es un **merge explícito y seguro**.

---

## ⚙️ Configuración

Todas las opciones son **opcionales** y se definen en **User Settings**  
(`Settings → Open Settings (JSON)`):

```json
{
  "updevStatus.baseBranch": "develop",
  "updevStatus.remoteName": "origin",
  "updevStatus.refreshIntervalMs": 3000
}
