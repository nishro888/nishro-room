# Nishro voice control — Windows offline speech (System.Speech / SAPI).
# Continuous (async) recognition. One JSON object per line on stdout:
#   {"ready":true} | {"mode":"command|dictate"} | {"c":"<cmd>"} | {"t":"<text>"}
#   {"level":0..100}   live mic level  |  {"error":"..."}
$ErrorActionPreference = "Stop"

# Make a REAL microphone (never a loopback like Stereo Mix) the default input,
# and unmute/raise it. Loopback-as-default was the reason voice heard nothing.
try { & "$PSScriptRoot\mic.ps1" -Action auto | Out-Null } catch {}

try {
  Add-Type -AssemblyName System.Speech
  $rec = New-Object System.Speech.Recognition.SpeechRecognitionEngine
  $rec.SetInputToDefaultAudioDevice()
} catch {
  [Console]::Out.WriteLine('{"error":"' + ($_.Exception.Message -replace '"','') + '"}'); [Console]::Out.Flush(); exit 1
}

# recognizable command phrases (constrained grammar = high accuracy)
$cmdWords = @(
  "next","previous","up","down","scroll","scroll down","scroll up","swipe up","swipe down",
  "like","double tap","heart","tap","select","play","pause","okay",
  "back","go back","home","go home","recents","recent apps","notifications",
  "volume up","volume down","mute",
  "send","enter","clear","delete","backspace",
  "type","dictate","reply","stop","stop typing","done"
)
$ch = New-Object System.Speech.Recognition.Choices
[void]$ch.Add([string[]]$cmdWords)
$gb = New-Object System.Speech.Recognition.GrammarBuilder
$gb.Append($ch)
$script:cmdGrammar  = New-Object System.Speech.Recognition.Grammar $gb
$script:dictGrammar = New-Object System.Speech.Recognition.DictationGrammar
$rec.LoadGrammar($script:cmdGrammar)
$rec.LoadGrammar($script:dictGrammar)

function Emit($o) { [Console]::Out.WriteLine(($o | ConvertTo-Json -Compress)); [Console]::Out.Flush() }

$script:mode = "command"
$script:cmdGrammar.Enabled  = $true
$script:dictGrammar.Enabled = $false
$script:lastLvl = 0

# Continuous recognition: subscribe, then pump events on this thread (reliable
# in a spawned process, unlike -Action blocks or a synchronous Recognize loop).
$null = Register-ObjectEvent -InputObject $rec -EventName SpeechRecognized -SourceIdentifier "SR"
$null = Register-ObjectEvent -InputObject $rec -EventName AudioLevelUpdated -SourceIdentifier "AL"

Emit @{ ready = $true }
$rec.RecognizeAsync([System.Speech.Recognition.RecognizeMode]::Multiple)

while ($true) {
  $evt = Wait-Event -Timeout 30
  if ($null -eq $evt) { continue }
  $src = $evt.SourceIdentifier
  $ea  = $evt.SourceEventArgs
  Remove-Event -EventIdentifier $evt.EventIdentifier

  if ($src -eq "AL") {
    $now = [Environment]::TickCount
    if (($now - $script:lastLvl) -ge 250) { $script:lastLvl = $now; Emit @{ level = [int]$ea.AudioLevel } }
    continue
  }

  # SpeechRecognized
  $r = $ea.Result
  if ($null -eq $r) { continue }
  $t = $r.Text.Trim().ToLower()
  if ($t -eq "") { continue }

  if ($script:mode -eq "command") {
    # Surface low-confidence hits so the user sees "heard X" even when we skip it.
    if ($r.Confidence -lt 0.45) { Emit @{ rej = $t; conf = [math]::Round($r.Confidence,2) }; continue }
    if ($t -in @("type","dictate","reply")) { $script:mode = "dictate"; $script:dictGrammar.Enabled = $true; Emit @{ mode = "dictate" }; continue }
    Emit @{ c = $t; conf = [math]::Round($r.Confidence,2) }
  } else {
    if ($t -in @("stop","stop typing","done")) { $script:mode = "command"; $script:dictGrammar.Enabled = $false; Emit @{ mode = "command" }; continue }
    if ($r.Confidence -ge 0.55 -and ($t -in @("send","enter","clear","delete","backspace","back","home"))) { Emit @{ c = $t }; continue }
    Emit @{ t = $r.Text }   # original-case dictated text
  }
}
