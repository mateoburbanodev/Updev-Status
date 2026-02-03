param(
  [string]$BaseBranch = "develop",
  [string]$RemoteName = "origin"
)

$ErrorActionPreference = "Stop"

# Must be inside a git work tree
git rev-parse --is-inside-work-tree | Out-Null

# Current branch
$start = (git rev-parse --abbrev-ref HEAD).Trim()
if ($start -eq "HEAD" -or [string]::IsNullOrWhiteSpace($start)) {
  throw "Estás en detached HEAD. Cambia a una rama primero."
}

try {
  # Fetch latest from remote
  git fetch $RemoteName | Out-Null

  # Ensure local base branch exists; if not, create it tracking remote
  git show-ref --verify --quiet "refs/heads/$BaseBranch"
  if ($LASTEXITCODE -ne 0) {
    # Ensure remote branch exists
    git show-ref --verify --quiet "refs/remotes/$RemoteName/$BaseBranch"
    if ($LASTEXITCODE -ne 0) {
      throw "No existe $RemoteName/$BaseBranch. Revisa el remoto o la rama base."
    }

    git switch -c $BaseBranch --track "$RemoteName/$BaseBranch" | Out-Null
  } else {
    git switch $BaseBranch | Out-Null
  }

  # Update base branch
  git pull --ff-only

  # Back to original branch
  git switch $start | Out-Null

  # Update current branch (optional but matches your flow)
  git pull --ff-only

  # Merge base into current branch
  git merge $BaseBranch
}
catch {
  # Best effort: return to original branch
  try { git switch $start | Out-Null } catch {}
  throw
}
