# Nishro internet speed sampler — emits {"down":bytes/s,"up":bytes/s} once a
# second on stdout. Uses adapter byte counters (locale-independent) and deltas.
$ErrorActionPreference = "SilentlyContinue"
function Emit($o) { [Console]::Out.WriteLine(($o | ConvertTo-Json -Compress)); [Console]::Out.Flush() }

$prevR = $null; $prevS = $null; $prevT = $null
while ($true) {
    $ad = Get-NetAdapter | Where-Object { $_.Status -eq 'Up' -and $_.InterfaceDescription -notmatch 'Loopback|Virtual|isatap|Teredo|Pseudo' }
    $st = $ad | Get-NetAdapterStatistics
    $r = ($st | Measure-Object -Property ReceivedBytes -Sum).Sum
    $s = ($st | Measure-Object -Property SentBytes -Sum).Sum
    if ($null -eq $r) { $r = 0 }; if ($null -eq $s) { $s = 0 }
    $now = Get-Date
    if ($null -ne $prevR) {
        $dt = ($now - $prevT).TotalSeconds; if ($dt -le 0) { $dt = 1 }
        $down = [math]::Max(0, [int64](($r - $prevR) / $dt))
        $up   = [math]::Max(0, [int64](($s - $prevS) / $dt))
        Emit @{ down = $down; up = $up }
    }
    $prevR = $r; $prevS = $s; $prevT = $now
    Start-Sleep -Milliseconds 1000
}
