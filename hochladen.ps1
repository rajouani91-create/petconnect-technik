# PetConnect: neue index.html auf GitHub hochladen (petconnect24.eu)
# Start in PowerShell:  & "C:\Users\user\Desktop\Projekt Petconnect\Technik\hochladen.ps1"

$quelle = "C:\Users\user\Desktop\Projekt Petconnect\index.html"
$repo   = "C:\Users\user\Desktop\petconnect-github"

if (-not (Test-Path $repo)) {
    Write-Host "GitHub-Ordner fehlt. Bitte zuerst einmal klonen (siehe Anleitung)." -ForegroundColor Red
    exit 1
}

$text = Read-Host "Was hat sich geaendert? (kurzer Satz)"
if ([string]::IsNullOrWhiteSpace($text)) { $text = "Neue Version des Prototyps" }

Set-Location $repo
git pull
Copy-Item $quelle "$repo\index.html" -Force
git add index.html
git commit -m $text
git push

Write-Host ""
Write-Host "Fertig. In 1-2 Minuten ist petconnect24.eu aktualisiert (Strg+F5)." -ForegroundColor Green
