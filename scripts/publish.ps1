param([string]$RepositoryName = 'piano-listen')
$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath (Split-Path -Parent $PSScriptRoot)
function Assert-Success([string]$Step) { if ($LASTEXITCODE -ne 0) { throw "$Step failed. See the message above." } }
& gh auth status
if ($LASTEXITCODE -ne 0) { throw 'Sign in first: gh auth login --hostname github.com --web' }
$owner = (& gh api user --jq .login).Trim()
Assert-Success 'Reading GitHub account'
& npm.cmd test
Assert-Success 'Tests'
& npm.cmd run build
Assert-Success 'Build'
if (-not (Test-Path -LiteralPath '.git')) { & git init -b main; Assert-Success 'Git initialization' }
$authorName = & git config --get user.name
if (-not $authorName) { & git config user.name $owner; Assert-Success 'Configuring local commit author' }
$authorEmail = & git config --get user.email
if (-not $authorEmail) {
  $githubId = (& gh api user --jq .id).Trim()
  Assert-Success 'Reading GitHub account ID'
  & git config user.email "$githubId+$owner@users.noreply.github.com"
  Assert-Success 'Configuring local private commit email'
}
& git add -- .
Assert-Success 'Staging changes'
& git diff --cached --quiet
if ($LASTEXITCODE -eq 1) { & git commit -m 'Build private piano transcription studio with offline iPhone PWA'; Assert-Success 'Commit' }
$remotes = @(& git remote)
Assert-Success 'Reading Git remotes'
if ($remotes -notcontains 'origin') {
  $repositoriesJson = & gh repo list $owner --limit 1000 --json name
  Assert-Success 'Checking existing repositories'
  $repositories = $repositoriesJson | ConvertFrom-Json
  if (@($repositories | Where-Object { $_.name -eq $RepositoryName }).Count -gt 0) {
    throw "The repository $owner/$RepositoryName already exists. Choose another name: .\scripts\publish.ps1 -RepositoryName another-name"
  }
  & gh repo create $RepositoryName --public --description 'Private piano-to-sheet-music studio with chord detection, exports and iPhone PWA' --source=. --remote=origin
  Assert-Success 'Creating GitHub repository'
} else {
  $remote = & git remote get-url origin
  Assert-Success 'Reading origin URL'
  $expectedA = "https://github.com/$owner/$RepositoryName.git"
  $expectedB = "git@github.com:$owner/$RepositoryName.git"
  if ($remote -ne $expectedA -and $remote -ne $expectedB -and $remote -ne "https://github.com/$owner/$RepositoryName") {
    throw "The existing origin ($remote) does not match $owner/$RepositoryName. No changes were pushed."
  }
}
$hasPages = (& gh api "repos/$owner/$RepositoryName" --jq .has_pages).Trim()
Assert-Success 'Reading Pages configuration'
if ($hasPages -eq 'true') {
  & gh api --method PATCH "repos/$owner/$RepositoryName/pages" -f build_type=workflow
} else {
  & gh api --method POST "repos/$owner/$RepositoryName/pages" -f build_type=workflow
}
Assert-Success 'Enabling GitHub Pages'
& git push --set-upstream origin main
Assert-Success 'Pushing source'
Write-Host "Repository: https://github.com/$owner/$RepositoryName"
Write-Host "The push triggered GitHub Pages. After the Actions workflow succeeds, open https://$owner.github.io/$RepositoryName/"
Write-Host 'On iPhone: Safari > Share > Add to Home Screen.'
