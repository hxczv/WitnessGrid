$ErrorActionPreference = 'Stop'
$root = 'C:\Users\Administrator\Documents\WitnessGrid\web\src'
$files = Get-ChildItem -Path $root -Recurse -Include *.tsx, *.ts
$changed = 0

$replacements = [ordered]@{
  'text-paper/90'  = 'text-fg/90'
  'text-paper/80'  = 'text-fg/90'
  'text-paper/70'  = 'text-fg/80'
  'text-paper/60'  = 'text-muted'
  'text-paper/50'  = 'text-muted'
  'text-paper/40'  = 'text-muted'
  'text-paper'     = 'text-fg'
  'bg-ink/80'      = 'bg-bg/80'
  'bg-ink/85'      = 'bg-bg/85'
  'bg-ink/90'      = 'bg-bg/90'
  'bg-ink/70'      = 'bg-bg/70'
  'bg-ink'         = 'bg-bg'
  'text-amber'     = 'text-accent'
  'bg-amber/15'    = 'bg-accent/15'
  'bg-amber/10'    = 'bg-accent/10'
  'bg-amber'       = 'bg-accent'
  'border-amber/40' = 'border-accent/40'
  'border-amber'   = 'border-accent'
  'border-flag/40' = 'border-danger/40'
  'border-flag/50' = 'border-danger/50'
  'border-flag'    = 'border-danger'
  'bg-flag/5'      = 'bg-danger/5'
  'bg-flag/10'     = 'bg-danger/10'
  'bg-flag'        = 'bg-danger'
  'text-flag'      = 'text-danger'
  'text-ink'       = 'text-on-accent'
}

foreach ($file in $files) {
  $text = Get-Content -Raw -LiteralPath $file.FullName
  $original = $text
  foreach ($key in $replacements.Keys) {
    $text = $text.Replace($key, $replacements[$key])
  }
  if ($text -ne $original) {
    Set-Content -LiteralPath $file.FullName -Value $text -NoNewline
    $changed++
    Write-Host "updated $($file.FullName)"
  }
}
Write-Host "DONE: $changed files changed"
