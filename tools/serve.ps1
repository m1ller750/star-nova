# Minimal static file server for local testing (no admin rights, no Node/Python needed).
# Usage: powershell -ExecutionPolicy Bypass -File tools/serve.ps1 -Port 8080
# Dev helper: POST /__shot?name=foo with a data-URL body saves .shots/foo.jpg (full-resolution screenshots).
param([int]$Port = 8080)

$Root = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$ShotDir = Join-Path $Root '.shots'
$listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, $Port)
$listener.Start()
Write-Host "NOVA dev server: http://localhost:$Port/  (root: $Root)"

$mime = @{
  '.html' = 'text/html; charset=utf-8'; '.js' = 'text/javascript; charset=utf-8'; '.mjs' = 'text/javascript; charset=utf-8'
  '.css' = 'text/css; charset=utf-8'; '.json' = 'application/json; charset=utf-8'; '.png' = 'image/png'
  '.jpg' = 'image/jpeg'; '.jpeg' = 'image/jpeg'; '.svg' = 'image/svg+xml'; '.ico' = 'image/x-icon'
  '.webp' = 'image/webp'; '.mp3' = 'audio/mpeg'; '.ogg' = 'audio/ogg'; '.wav' = 'audio/wav'
  '.md' = 'text/plain; charset=utf-8'; '.txt' = 'text/plain; charset=utf-8'; '.woff2' = 'font/woff2'
}

function Send-Response($stream, [int]$code, [string]$status, [string]$type, [byte[]]$body, [bool]$head) {
  $header = "HTTP/1.1 $code $status`r`nContent-Type: $type`r`nContent-Length: $($body.Length)`r`nCache-Control: no-store`r`nAccess-Control-Allow-Origin: *`r`nConnection: close`r`n`r`n"
  $hb = [System.Text.Encoding]::ASCII.GetBytes($header)
  $stream.Write($hb, 0, $hb.Length)
  if (-not $head -and $body.Length -gt 0) { $stream.Write($body, 0, $body.Length) }
  $stream.Flush()
}

function Read-Headers($stream) {
  $buf = New-Object System.Collections.Generic.List[byte]
  $one = New-Object byte[] 1
  while ($true) {
    $n = $stream.Read($one, 0, 1)
    if ($n -le 0) { break }
    $buf.Add($one[0])
    $c = $buf.Count
    if ($c -ge 4 -and $buf[$c - 4] -eq 13 -and $buf[$c - 3] -eq 10 -and $buf[$c - 2] -eq 13 -and $buf[$c - 1] -eq 10) { break }
    if ($c -gt 65536) { break }
  }
  return [System.Text.Encoding]::ASCII.GetString($buf.ToArray())
}

while ($true) {
  $client = $listener.AcceptTcpClient()
  try {
    $client.ReceiveTimeout = 8000
    $stream = $client.GetStream()
    $headText = Read-Headers $stream
    if (-not $headText) { continue }
    $lines = $headText -split "`r`n"
    $requestLine = $lines[0]
    $method = 'GET'; $path = '/'
    if ($requestLine -match '^(GET|HEAD|POST|OPTIONS) (\S+)') { $method = $Matches[1]; $path = $Matches[2] }
    $len = 0
    foreach ($l in $lines) { if ($l -match '^Content-Length:\s*(\d+)') { $len = [int]$Matches[1] } }
    if ($method -eq 'OPTIONS') { Send-Response $stream 204 'No Content' 'text/plain' (New-Object byte[] 0) $true; continue }
    if ($method -eq 'POST') {
      $body = New-Object byte[] $len
      $read = 0
      while ($read -lt $len) { $n = $stream.Read($body, $read, $len - $read); if ($n -le 0) { break }; $read += $n }
      $name = 'shot'
      if ($path -match 'name=([A-Za-z0-9_\-]+)') { $name = $Matches[1] }
      $text = [System.Text.Encoding]::ASCII.GetString($body, 0, $read)
      $comma = $text.IndexOf(',')
      if ($comma -ge 0) { $text = $text.Substring($comma + 1) }
      if (-not (Test-Path $ShotDir)) { New-Item -ItemType Directory -Path $ShotDir | Out-Null }
      [System.IO.File]::WriteAllBytes((Join-Path $ShotDir "$name.jpg"), [Convert]::FromBase64String($text))
      Send-Response $stream 200 'OK' 'text/plain' ([System.Text.Encoding]::ASCII.GetBytes('saved')) $false
      continue
    }
    $path = [Uri]::UnescapeDataString(($path -split '\?')[0])
    if ($path.EndsWith('/')) { $path += 'index.html' }
    $full = [System.IO.Path]::GetFullPath((Join-Path $Root ($path.TrimStart('/').Replace('/', '\'))))
    if ($full.StartsWith($Root, [System.StringComparison]::OrdinalIgnoreCase) -and (Test-Path -LiteralPath $full -PathType Leaf)) {
      $bytes = [System.IO.File]::ReadAllBytes($full)
      $ext = [System.IO.Path]::GetExtension($full).ToLower()
      $ct = $mime[$ext]; if (-not $ct) { $ct = 'application/octet-stream' }
      Send-Response $stream 200 'OK' $ct $bytes ($method -eq 'HEAD')
    } else {
      Send-Response $stream 404 'Not Found' 'text/plain' ([System.Text.Encoding]::UTF8.GetBytes('404 Not Found')) ($method -eq 'HEAD')
    }
  } catch {
  } finally {
    $client.Close()
  }
}
