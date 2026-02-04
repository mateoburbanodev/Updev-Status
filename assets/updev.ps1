param(
  [string]$BaseBranch = "develop",
  [string]$RemoteName = "origin",
  [ValidateSet("nothing","suggestPush","autoPush")]
  [string]$AfterUpdev = "suggestPush"
)

$ErrorActionPreference = "Stop"

function Test-Conflicts {
  $out = git diff --name-only --diff-filter=U
  return -not [string]::IsNullOrWhiteSpace($out)
}

function Get-CurrentBranch {
  return (git rev-parse --abbrev-ref HEAD).Trim()
}

# Verificar que estamos en un repo git
git rev-parse --is-inside-work-tree | Out-Null

$start = Get-CurrentBranch
if ($start -eq "HEAD" -or [string]::IsNullOrWhiteSpace($start)) {
  throw "Estás en detached HEAD. Cambia a una rama antes de ejecutar updev."
}

try {
  Write-Host "== updev =="
  Write-Host "Remote: $RemoteName | Base: $BaseBranch | Rama actual: $start"
  Write-Host ""

  # Fetch remoto
  Write-Host "-> git fetch $RemoteName"
  git fetch $RemoteName | Out-Null

  # Asegurar rama base local
  git show-ref --verify --quiet "refs/heads/$BaseBranch"
  if ($LASTEXITCODE -ne 0) {
    git show-ref --verify --quiet "refs/remotes/$RemoteName/$BaseBranch"
    if ($LASTEXITCODE -ne 0) {
      throw "No existe la rama $RemoteName/$BaseBranch. Revisa el remoto o la rama base."
    }

    Write-Host "-> creando rama local $BaseBranch (track $RemoteName/$BaseBranch)"
    git switch -c $BaseBranch --track "$RemoteName/$BaseBranch" | Out-Null
  }
  else {
    Write-Host "-> git switch $BaseBranch"
    git switch $BaseBranch | Out-Null
  }

  # Actualizar rama base
  Write-Host "-> git pull --ff-only"
  git pull --ff-only

  # Volver a la rama original
  Write-Host "-> git switch $start"
  git switch $start | Out-Null

  # Actualizar rama actual
  Write-Host "-> git pull --ff-only"
  git pull --ff-only

  # Merge de la base
  Write-Host "-> git merge $BaseBranch"
  git merge $BaseBranch

  # Comprobar conflictos
  if (Test-Conflicts) {
    Write-Host ""
    Write-Host "⚠️  Hay conflictos. NO se hará push." -ForegroundColor Yellow
    Write-Host "Resuelve los conflictos y luego ejecuta:"
    Write-Host "  git add <archivos>"
    Write-Host "  git commit"
    Write-Host "  git push"
    exit 0
  }

  Write-Host ""
  Write-Host "✅ Merge completado sin conflictos." -ForegroundColor Green

  switch ($AfterUpdev) {
    "nothing" {
      exit 0
    }
    "suggestPush" {
      Write-Host ""
      Write-Host "Sugerencia:" -ForegroundColor Cyan
      Write-Host "  git push $RemoteName $start"
      exit 0
    }
    "autoPush" {
      Write-Host ""
      Write-Host "-> git push $RemoteName $start" -ForegroundColor Cyan
      git push $RemoteName $start
      exit 0
    }
  }
}
catch {
  try {
    git switch $start | Out-Null
  } catch {}
  throw
}
