# Nishro mic monitor — reports live input level only (no recognition/commands).
# Used to show a mic meter in the settings panel so the user can test the mic.
#   emits {"ready":true} | {"level":0..100} | {"error":"..."}
$ErrorActionPreference = "Stop"

# Make a REAL microphone (never a loopback like Stereo Mix) the default input,
# and unmute/raise it — so the meter reflects an actual mic.
try { & "$PSScriptRoot\mic.ps1" -Action auto | Out-Null } catch {}

try {
  Add-Type -AssemblyName System.Speech
  $rec = New-Object System.Speech.Recognition.SpeechRecognitionEngine
  $rec.SetInputToDefaultAudioDevice()
  $rec.LoadGrammar((New-Object System.Speech.Recognition.DictationGrammar))  # needed for RecognizeAsync
} catch {
  [Console]::Out.WriteLine('{"error":"' + ($_.Exception.Message -replace '"','') + '"}'); [Console]::Out.Flush(); exit 1
}

function Emit($o) { [Console]::Out.WriteLine(($o | ConvertTo-Json -Compress)); [Console]::Out.Flush() }
$null = Register-ObjectEvent -InputObject $rec -EventName AudioLevelUpdated -SourceIdentifier AL
Emit @{ ready = $true }
$rec.RecognizeAsync([System.Speech.Recognition.RecognizeMode]::Multiple)

$last = 0
while ($true) {
  $e = Wait-Event -Timeout 30
  if ($null -eq $e) { continue }
  $now = [Environment]::TickCount
  if (($now - $last) -ge 120) { $last = $now; Emit @{ level = [int]$e.SourceEventArgs.AudioLevel } }
  Remove-Event -EventIdentifier $e.EventIdentifier
}
