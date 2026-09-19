# privacy.ps1 - which apps are using (or last used) the camera & microphone.
#
# Windows keeps a per-app usage ledger under CapabilityAccessManager\ConsentStore.
# Each app key has LastUsedTimeStart / LastUsedTimeStop (FILETIME QWORDs). When
# Stop == 0 the app is using the device RIGHT NOW - this is the same source the
# Settings "recent activity" list and the taskbar mic indicator read from.
# Output: one compact JSON object { camera:[...], microphone:[...] } on stdout.

$ErrorActionPreference = "SilentlyContinue"

function Scan-Device([string]$device) {
  $bases = @(
    "HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\CapabilityAccessManager\ConsentStore\$device",
    "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\CapabilityAccessManager\ConsentStore\$device"
  )
  $byId = @{}
  foreach ($base in $bases) {
    if (-not (Test-Path $base)) { continue }
    $keys = @(Get-Item $base) + @(Get-ChildItem $base -Recurse)
    foreach ($k in $keys) {
      $p = Get-ItemProperty $k.PSPath
      if ($null -eq $p.LastUsedTimeStart) { continue }

      # Path after "...\ConsentStore\<device>\"
      $rel = $k.Name -replace ('^.*\\ConsentStore\\' + $device + '\\?'), ''
      if ($rel -eq '') { continue }

      if ($rel -match '^NonPackaged\\(.+)$') {
        $token = ($matches[1] -split '\\')[0]
        $path  = $token -replace '#','\'
        $name  = Split-Path $path -Leaf
        $packaged = $false
      } else {
        $token = ($rel -split '\\')[0]
        $path  = $token
        $name  = $token -replace '_[^_]+$',''     # strip the publisher hash
        $packaged = $true
      }
      if (-not $token) { continue }

      $start = [int64]$p.LastUsedTimeStart
      $stop  = [int64]$p.LastUsedTimeStop
      $inUse = ($stop -eq 0 -and $start -gt 0)
      $startMs = if ($start -gt 0) { [DateTimeOffset]::FromFileTime($start).ToUnixTimeMilliseconds() } else { $null }
      $stopMs  = if ($stop  -gt 0) { [DateTimeOffset]::FromFileTime($stop ).ToUnixTimeMilliseconds() } else { $null }

      $entry = [PSCustomObject]@{
        name = $name; path = $path; packaged = $packaged
        inUse = $inUse; lastStart = $startMs; lastStop = $stopMs
      }
      # de-dupe (HKCU + HKLM can both list a token) - keep the most recent
      $prev = $byId[$token]
      if ($null -eq $prev -or $inUse -or ($startMs -gt $prev.lastStart)) { $byId[$token] = $entry }
    }
  }
  # in-use first, then most-recently-used
  @($byId.Values | Sort-Object @{e={$_.inUse};d=$true}, @{e={$_.lastStart};d=$true})
}

$out = [ordered]@{
  camera     = @(Scan-Device 'webcam')
  microphone = @(Scan-Device 'microphone')
}
$out | ConvertTo-Json -Depth 5 -Compress
