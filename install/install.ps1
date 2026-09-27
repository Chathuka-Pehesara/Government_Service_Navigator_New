# Installs (or updates) the Government Service Navigator desktop app on Windows
# from the latest GitHub Release.
#
#   PowerShell:
#     irm https://raw.githubusercontent.com/Goverment-Service/Government_Service_Navigator/main/install/install.ps1 | iex
#
#   CMD:
#     powershell -NoProfile -ExecutionPolicy Bypass -Command "irm https://raw.githubusercontent.com/Goverment-Service/Government_Service_Navigator/main/install/install.ps1 | iex"
#
# Wrapped in a script block so `irm | iex` doesn't leak variables or
# $ErrorActionPreference into the caller's session.
& {
    $ErrorActionPreference = 'Stop'
    # The progress bar makes Invoke-WebRequest very slow on Windows PowerShell 5.1.
    $ProgressPreference = 'SilentlyContinue'
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

    $repo = 'Goverment-Service/Government_Service_Navigator'

    Write-Host 'Finding the latest Government Service Navigator release...'
    $release = Invoke-RestMethod "https://api.github.com/repos/$repo/releases/latest" -Headers @{ 'User-Agent' = 'gsn-installer' }
    $asset = $release.assets | Where-Object { $_.name -like 'GSN-Setup-*.exe' } | Select-Object -First 1
    if (-not $asset) {
        throw "Release $($release.tag_name) has no GSN-Setup-*.exe installer."
    }

    $installer = Join-Path $env:TEMP $asset.name
    Write-Host "Downloading $($asset.name) ($([math]::Round($asset.size / 1MB, 1)) MB)..."
    Invoke-WebRequest $asset.browser_download_url -OutFile $installer -UseBasicParsing

    try {
        Write-Host 'Installing...'
        # /S = silent NSIS install for the current user (no admin rights needed).
        $proc = Start-Process $installer -ArgumentList '/S' -Wait -PassThru
        if ($proc.ExitCode -ne 0) {
            throw "Installer exited with code $($proc.ExitCode)."
        }
    }
    finally {
        Remove-Item $installer -Force -ErrorAction SilentlyContinue
    }

    Write-Host "Government Service Navigator $($release.tag_name) installed. Open it from the Start menu." -ForegroundColor Green
}
