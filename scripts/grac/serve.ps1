# Serves this folder to the browser on this PC only, with nothing to install:
# PowerShell and .NET's HttpListener come with every Windows 10 and 11.
# Started by 게임실행.bat; close this window to stop the game's server.
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$types = @{
    '.html' = 'text/html; charset=utf-8'; '.js' = 'application/javascript; charset=utf-8'
    '.css' = 'text/css; charset=utf-8'; '.json' = 'application/json'; '.txt' = 'text/plain; charset=utf-8'
    '.png' = 'image/png'; '.ico' = 'image/x-icon'; '.mp3' = 'audio/mpeg'; '.woff2' = 'font/woff2'
}

# The first free port from 8000 up.
$listener = $null
foreach ($port in 8000..8050) {
    try {
        $listener = [System.Net.HttpListener]::new()
        $listener.Prefixes.Add("http://localhost:$port/")
        $listener.Start()
        break
    } catch { $listener = $null }
}
if (-not $listener) { Write-Host '사용할 수 있는 포트를 찾지 못했습니다.'; Read-Host '엔터를 누르면 닫힙니다'; exit 1 }

$url = $listener.Prefixes | Select-Object -First 1
Write-Host ''
Write-Host "  메이즈 위스커스를 브라우저에서 엽니다: $url"
Write-Host '  게임을 마치면 이 창을 닫으세요.'
Write-Host ''
if (-not $env:MW_NO_BROWSER) { Start-Process $url }

while ($listener.IsListening) {
    $context = $listener.GetContext()
    $response = $context.Response
    try {
        $path = [System.Uri]::UnescapeDataString($context.Request.Url.AbsolutePath).TrimStart('/')
        if ($path -eq '') { $path = 'index.html' }
        $file = [System.IO.Path]::GetFullPath((Join-Path $root $path))
        # Only files inside this folder.
        if (-not $file.StartsWith($root, [System.StringComparison]::OrdinalIgnoreCase) -or -not (Test-Path $file -PathType Leaf)) {
            $response.StatusCode = 404
        } else {
            $ext = [System.IO.Path]::GetExtension($file).ToLowerInvariant()
            $response.ContentType = if ($types.ContainsKey($ext)) { $types[$ext] } else { 'application/octet-stream' }
            $bytes = [System.IO.File]::ReadAllBytes($file)
            $response.ContentLength64 = $bytes.Length
            $response.OutputStream.Write($bytes, 0, $bytes.Length)
        }
    } catch {
        $response.StatusCode = 500
    } finally {
        $response.OutputStream.Close()
    }
}
