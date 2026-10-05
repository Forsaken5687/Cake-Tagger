param([Parameter(Mandatory = $true)][ValidateRange(1, 2147483647)][int]$ProcessId)
$ErrorActionPreference = 'Stop'
$taggerRoot = Split-Path -Parent $PSScriptRoot
$expectedRuntime = [IO.Path]::GetFullPath((Join-Path $taggerRoot 'runtime/node.exe'))
$target = Get-Process -Id $ProcessId
if ($target.Path -ne $expectedRuntime) { throw 'The target is not the bundled Cake Tagger runtime.' }
# A hidden service can inherit low Windows QoS despite Normal process priority.
# Control only execution-speed throttling; preserve other power flags and priority.
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public static class CakeTaggerPowerPolicy {
    [StructLayout(LayoutKind.Sequential)] public struct State {
        public uint Version; public uint ControlMask; public uint StateMask;
    }
    [DllImport("kernel32.dll", SetLastError=true)] public static extern IntPtr OpenProcess(uint rights, bool inherit, uint id);
    [DllImport("kernel32.dll", SetLastError=true)] public static extern bool GetProcessInformation(IntPtr handle, int kind, ref State state, uint size);
    [DllImport("kernel32.dll", SetLastError=true)] public static extern bool SetProcessInformation(IntPtr handle, int kind, ref State state, uint size);
    [DllImport("kernel32.dll")] public static extern bool CloseHandle(IntPtr handle);
}
"@
$handle = [CakeTaggerPowerPolicy]::OpenProcess(0x1200, $false, $ProcessId)
if ($handle -eq [IntPtr]::Zero) { throw 'Could not open the runtime process.' }
try {
    $state = New-Object CakeTaggerPowerPolicy+State
    $state.Version = 1
    if (-not [CakeTaggerPowerPolicy]::GetProcessInformation($handle, 4, [ref]$state, 12)) { throw 'Process power policy is unavailable.' }
    $state.ControlMask = $state.ControlMask -bor 1
    $state.StateMask = $state.StateMask -band 0xfffffffe
    if (-not [CakeTaggerPowerPolicy]::SetProcessInformation($handle, 4, [ref]$state, 12)) { throw 'Could not apply process power policy.' }
    $actual = New-Object CakeTaggerPowerPolicy+State
    $actual.Version = 1
    if (-not [CakeTaggerPowerPolicy]::GetProcessInformation($handle, 4, [ref]$actual, 12) -or ($actual.ControlMask -band 1) -eq 0 -or ($actual.StateMask -band 1) -ne 0) { throw 'Process power policy was not confirmed.' }
    Write-Output 'high-qos'
} finally { [CakeTaggerPowerPolicy]::CloseHandle($handle) | Out-Null }
