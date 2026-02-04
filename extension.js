const vscode = require("vscode");
const cp = require("child_process");
const path = require("path");
const fs = require("fs");

/* -------------------- utils -------------------- */

function execGit(cmd, cwd) {
  return new Promise((resolve) => {
    cp.exec(cmd, { cwd, windowsHide: true }, (err, stdout, stderr) => {
      resolve({ ok: !err, stdout: stdout ?? "", stderr: stderr ?? "" });
    });
  });
}

function getConfig() {
  const cfg = vscode.workspace.getConfiguration("updevStatus");
  return {
    baseBranch: cfg.get("baseBranch", "develop"),
    remoteName: cfg.get("remoteName", "origin"),
    afterUpdev: cfg.get("afterUpdev","suggestPush"),
    refreshIntervalMs: cfg.get("refreshIntervalMs", 3000),
    onConflictsRun: cfg.get("onConflictsRun", "quickPick")
  };
}

async function isGitRepo(cwd) {
  const r = await execGit("git rev-parse --is-inside-work-tree", cwd);
  return r.ok && r.stdout.trim() === "true";
}

async function getGitTopLevel(cwd) {
  const r = await execGit("git rev-parse --show-toplevel", cwd);
  return r.ok ? r.stdout.trim() : null;
}

async function hasConflicts(cwd) {
  const r = await execGit("git diff --name-only --diff-filter=U", cwd);
  if (!r.ok) return [];
  return r.stdout
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
}

async function getRepoContext() {
  const folders = vscode.workspace.workspaceFolders;
  if (!folders?.length) return { cwd: null, folder: null };

  const active = vscode.window.activeTextEditor?.document?.uri;
  const wsFolder = active
    ? vscode.workspace.getWorkspaceFolder(active)
    : folders[0];

  const base = wsFolder?.uri.fsPath ?? folders[0].uri.fsPath;
  const top = await getGitTopLevel(base);

  return {
    cwd: top ?? base,
    folder: wsFolder
  };
}

/* -------------------- updev runner -------------------- */

async function ensureBundledScript(context) {
  const storageDir = context.globalStorageUri.fsPath;
  if (!fs.existsSync(storageDir)) fs.mkdirSync(storageDir, { recursive: true });

  const target = path.join(storageDir, "updev.ps1");
  const bundled = path.join(context.extensionPath, "assets", "updev.ps1");

  fs.copyFileSync(bundled, target);
  return target;
}

async function runUpdev(context, cwd, folder) {
  const script = await ensureBundledScript(context);
  const { baseBranch, remoteName, afterUpdev } = getConfig();

  const exec = new vscode.ShellExecution(
    "pwsh",
    [
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      script,
      "-BaseBranch",
      baseBranch,
      "-RemoteName",
      remoteName,
      "-AfterUpdev",
      afterUpdev
    ],
    { cwd }
  );

  const task = new vscode.Task(
    { type: "shell", name: "Updev" },
    folder ?? vscode.TaskScope.Workspace,
    "Updev",
    "updev-status",
    exec
  );

  task.presentationOptions = {
    reveal: vscode.TaskRevealKind.Always,
    panel: vscode.TaskPanelKind.Shared
  };

  await vscode.tasks.executeTask(task);
}

/* -------------------- conflicts UI -------------------- */

async function openManyFiles(repoCwd, files, limit = 50) {
  for (const f of files.slice(0, limit)) {
    try {
      const doc = await vscode.workspace.openTextDocument(
        vscode.Uri.file(path.join(repoCwd, f))
      );
      await vscode.window.showTextDocument(doc, { preview: false });
    } catch {}
  }
}

async function pickConflictFiles(repoCwd, files) {
  const OPEN_ALL = "__ALL__";

  const items = [
    {
      label: "📂 Abrir todos los archivos en conflicto",
      id: OPEN_ALL
    },
    ...files.map((f) => ({
      label: f,
      id: f
    }))
  ];

  const pick = await vscode.window.showQuickPick(items, {
    title: "Conflictos detectados",
    placeHolder: "Selecciona un archivo o abre todos"
  });

  if (!pick) return;

  if (pick.id === OPEN_ALL) {
    await openManyFiles(repoCwd, files);
  } else {
    const doc = await vscode.workspace.openTextDocument(
      vscode.Uri.file(path.join(repoCwd, pick.id))
    );
    await vscode.window.showTextDocument(doc, { preview: false });
  }
}

/* -------------------- activate -------------------- */

function activate(context) {
  const item = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left,
    1000
  );
  item.command = "updevStatus.click";
  item.show();

  let lastConflicts = [];

  const refresh = async () => {
    const { cwd } = await getRepoContext();
    if (!cwd || !(await isGitRepo(cwd))) {
      item.text = "$(circle-slash) updev";
      return;
    }

    lastConflicts = await hasConflicts(cwd);

    if (lastConflicts.length) {
      item.text = "$(alert) conflicts";
      item.tooltip = `Hay ${lastConflicts.length} conflictos pendientes`;
      item.color = new vscode.ThemeColor("errorForeground");
    } else {
      item.text = "$(git-merge) updev";
      item.tooltip = "Repositorio limpio. Ejecutar updev.";
      item.color = undefined;
    }
  };

  /* ---------- comandos ---------- */

  context.subscriptions.push(
    vscode.commands.registerCommand("updevStatus.click", async () => {
      const { cwd, folder } = await getRepoContext();
      if (!cwd || !(await isGitRepo(cwd))) return;

      if (lastConflicts.length) {
        await vscode.commands.executeCommand("workbench.view.scm");
        await pickConflictFiles(cwd, lastConflicts);
        return;
      }

      await runUpdev(context, cwd, folder);
    }),

    vscode.commands.registerCommand("updevStatus.run", async () => {
      const { cwd, folder } = await getRepoContext();
      if (!cwd || !(await isGitRepo(cwd))) return;

      const conflicts = await hasConflicts(cwd);
      const { onConflictsRun } = getConfig();

      if (conflicts.length) {
        if (onConflictsRun === "openScm") {
          await vscode.commands.executeCommand("workbench.view.scm");
          return;
        }
        if (onConflictsRun === "quickPick") {
          await vscode.commands.executeCommand("workbench.view.scm");
          await pickConflictFiles(cwd, conflicts);
          return;
        }
        vscode.window.showWarningMessage(
          "Hay conflictos pendientes. Resuélvelos antes de ejecutar updev."
        );
        return;
      }

      await runUpdev(context, cwd, folder);
    }),

    vscode.commands.registerCommand(
      "updevStatus.resolveConflicts",
      async () => {
        const { cwd } = await getRepoContext();
        if (!cwd || !(await isGitRepo(cwd))) return;

        const conflicts = await hasConflicts(cwd);
        if (!conflicts.length) {
          vscode.window.showInformationMessage(
            "No hay conflictos en el repositorio activo."
          );
          return;
        }

        await vscode.commands.executeCommand("workbench.view.scm");
        await pickConflictFiles(cwd, conflicts);
      }
    ),

    vscode.commands.registerCommand(
      "updevStatus.openKeybindings",
      async () => {
        await vscode.commands.executeCommand(
          "workbench.action.openGlobalKeybindings",
          "updevStatus"
        );
      }
    )
  );

  /* ---------- lifecycle ---------- */

  refresh();
  setInterval(refresh, getConfig().refreshIntervalMs);
  vscode.window.onDidChangeActiveTextEditor(refresh);
  vscode.workspace.onDidSaveTextDocument(refresh);
}

function deactivate() {}

module.exports = { activate, deactivate };
