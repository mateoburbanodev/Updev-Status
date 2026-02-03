const vscode = require("vscode");
const cp = require("child_process");
const path = require("path");
const fs = require("fs");

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
    refreshIntervalMs: cfg.get("refreshIntervalMs", 3000)
  };
}

function getActiveFilePath() {
  const ed = vscode.window.activeTextEditor;
  const uri = ed?.document?.uri;
  if (!uri || uri.scheme !== "file") return null;
  return uri.fsPath;
}

function getWorkspaceFolderForFile(fsPath) {
  const folders = vscode.workspace.workspaceFolders;
  if (!folders?.length) return null;
  const folder = vscode.workspace.getWorkspaceFolder(vscode.Uri.file(fsPath));
  return folder ?? folders[0];
}

async function getGitTopLevel(cwd) {
  const r = await execGit("git rev-parse --show-toplevel", cwd);
  if (!r.ok) return null;
  return r.stdout.trim();
}

async function isGitRepo(cwd) {
  const r = await execGit("git rev-parse --is-inside-work-tree", cwd);
  return r.ok && r.stdout.trim() === "true";
}

async function hasConflicts(cwd) {
  const r = await execGit("git diff --name-only --diff-filter=U", cwd);
  if (!r.ok) return { state: "no-repo", files: [] };

  const files = r.stdout
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);

  return { state: files.length > 0 ? "conflicts" : "clean", files };
}

async function getRepoContext() {
  const folders = vscode.workspace.workspaceFolders;
  if (!folders?.length) return { cwd: null, folder: null };

  const active = getActiveFilePath();
  const wsFolder = active ? getWorkspaceFolderForFile(active) : folders[0];
  const baseCwd = wsFolder?.uri.fsPath ?? folders[0].uri.fsPath;

  const top = await getGitTopLevel(baseCwd);
  if (!top) return { cwd: baseCwd, folder: wsFolder };

  const repoFolder = vscode.workspace.getWorkspaceFolder(vscode.Uri.file(top)) ?? wsFolder;
  return { cwd: top, folder: repoFolder };
}

async function ensureBundledScript(context) {
  const storageDir = context.globalStorageUri.fsPath;
  if (!fs.existsSync(storageDir)) fs.mkdirSync(storageDir, { recursive: true });

  const target = path.join(storageDir, "updev.ps1");
  const bundled = path.join(context.extensionPath, "assets", "updev.ps1");

  // Copia siempre para aplicar updates
  fs.copyFileSync(bundled, target);
  return target;
}

async function runBundledUpdevTask(context, repoCwd, workspaceFolder) {
  const scriptAbs = await ensureBundledScript(context);
  const { baseBranch, remoteName } = getConfig();

  const args = [
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-File",
    scriptAbs,
    "-BaseBranch",
    baseBranch,
    "-RemoteName",
    remoteName
  ];

  const exec = new vscode.ShellExecution("pwsh", args, { cwd: repoCwd });

  const task = new vscode.Task(
    { type: "shell", name: "Updev (bundled)" },
    workspaceFolder ?? vscode.TaskScope.Workspace,
    "Updev",
    "updev-status",
    exec
  );

  task.presentationOptions = {
    reveal: vscode.TaskRevealKind.Always,
    panel: vscode.TaskPanelKind.Shared,
    clear: false
  };

  await vscode.tasks.executeTask(task);
}

function repoNameFromCwd(cwd) {
  return cwd ? path.basename(cwd) : "";
}

async function openFileAbs(absPath) {
  const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(absPath));
  await vscode.window.showTextDocument(doc, { preview: false });
}

async function openManyFiles(repoCwd, relPaths, limit = 50) {
  const toOpen = relPaths.slice(0, limit);

  for (const rel of toOpen) {
    const abs = path.join(repoCwd, rel);
    try {
      await openFileAbs(abs);
    } catch {
      // no rompemos el flujo si uno falla
    }
  }

  if (relPaths.length > limit) {
    vscode.window.showWarningMessage(
      `Había ${relPaths.length} conflictos; he abierto los primeros ${limit}.`
    );
  }
}

async function pickAndOpenConflictFile(repoCwd, conflictFiles) {
  if (!conflictFiles?.length) return;

  const OPEN_ALL_ID = "__OPEN_ALL__";

  const items = [
    {
      id: OPEN_ALL_ID,
      label: "$(files) Abrir todos",
      description: `Abrir ${conflictFiles.length} archivos en conflicto`,
      detail: "Abre todos los archivos en conflicto en el editor."
    },
    ...conflictFiles.map((rel) => ({
      id: rel,
      label: rel,
      description: "",
      detail: path.join(repoCwd, rel)
    }))
  ];

  const picked = await vscode.window.showQuickPick(items, {
    title: "Conflictos detectados",
    placeHolder: "Elige un archivo en conflicto o abre todos",
    matchOnDescription: true,
    matchOnDetail: true
  });

  if (!picked) return;

  if (picked.id === OPEN_ALL_ID) {
    await openManyFiles(repoCwd, conflictFiles);
  } else {
    try {
      await openFileAbs(picked.detail);
    } catch {
      // fallback
      try {
        await openFileAbs(path.join(repoCwd, picked.label));
      } catch {
        vscode.window.showWarningMessage("No pude abrir el archivo seleccionado.");
      }
    }
  }

  // Opcional: intenta abrir Merge Editor (si existe el comando)
  try {
    await vscode.commands.executeCommand("mergeEditor.open");
  } catch {}
}

function activate(context) {
  const item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 1000);
  item.command = "updevStatus.click";
  item.show();

  let lastState = "unknown";
  let repoOk = false;
  let lastConflictFiles = [];

  const refresh = async () => {
    const { cwd } = await getRepoContext();

    if (!cwd) {
      item.text = "$(circle-slash) updev";
      item.tooltip = "No workspace abierto";
      item.color = new vscode.ThemeColor("statusBarItem.warningForeground");
      lastState = "no-workspace";
      repoOk = false;
      lastConflictFiles = [];
      return;
    }

    repoOk = await isGitRepo(cwd);
    if (!repoOk) {
      item.text = "$(circle-slash) updev";
      item.tooltip = `No es un repositorio Git (repo activo: ${repoNameFromCwd(cwd)})`;
      item.color = new vscode.ThemeColor("statusBarItem.warningForeground");
      lastState = "no-repo";
      lastConflictFiles = [];
      return;
    }

    const r = await hasConflicts(cwd);
    lastConflictFiles = r.files ?? [];

    const repoLabel = repoNameFromCwd(cwd);

    if (r.state === "conflicts") {
      item.text = "$(alert) conflicts";
      item.color = new vscode.ThemeColor("errorForeground");
      item.tooltip =
        `Repo: ${repoLabel}\n` +
        `Hay conflictos pendientes (${lastConflictFiles.length}).\n` +
        "Click: abrir Source Control + selector (incluye Abrir todos).";
      lastState = "conflicts";
    } else {
      item.text = "$(git-merge) updev";
      item.color = undefined;
      item.tooltip = `Repo: ${repoLabel}\nSin conflictos.\nClick: ejecutar updev (merge).`;
      lastState = "clean";
    }
  };

  const clickDisposable = vscode.commands.registerCommand("updevStatus.click", async () => {
    const { cwd, folder } = await getRepoContext();
    if (!cwd) {
      vscode.window.showInformationMessage("Abre un workspace para usar updev.");
      return;
    }

    const ok = await isGitRepo(cwd);
    if (!ok) {
      vscode.window.showInformationMessage("El contexto activo no parece un repo Git.");
      return;
    }

    if (lastState === "conflicts") {
      await vscode.commands.executeCommand("workbench.view.scm");
      await pickAndOpenConflictFile(cwd, lastConflictFiles);
      return;
    }

    await runBundledUpdevTask(context, cwd, folder);
  });

  context.subscriptions.push(item, clickDisposable);

  // Timer configurable
  let timer = null;
  const startTimer = () => {
    if (timer) clearInterval(timer);
    const { refreshIntervalMs } = getConfig();
    timer = setInterval(refresh, refreshIntervalMs);
    context.subscriptions.push({ dispose: () => clearInterval(timer) });
  };

  refresh();
  startTimer();

  // Multi-root "repo del archivo activo"
  context.subscriptions.push(vscode.window.onDidChangeActiveTextEditor(() => refresh()));

  // Refrescos extra
  context.subscriptions.push(vscode.workspace.onDidSaveTextDocument(() => refresh()));
  context.subscriptions.push(vscode.workspace.onDidChangeWorkspaceFolders(() => {
    refresh();
    startTimer();
  }));

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("updevStatus")) {
        refresh();
        startTimer();
      }
    })
  );
}

function deactivate() {}

module.exports = { activate, deactivate };
