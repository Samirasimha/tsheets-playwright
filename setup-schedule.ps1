# TSheets Auto-Fill - Windows Scheduled Task Setup
# Run as Administrator

param(
	[string]$Time = "16:00",
	[string]$RandomDelay = "02:00:00",
	[switch]$Remove
)

$TaskName = "TSheets-AutoFill"
$ScriptDir = $PSScriptRoot
$NodePath = (Get-Command node -ErrorAction SilentlyContinue).Source

if (-not $NodePath) {
	Write-Error "Node.js not found on PATH. Install Node.js first."
	exit 1
}

if ($Remove) {
	Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue
	Write-Host "Removed scheduled task '$TaskName'."
	exit 0
}

# Create the action: run node fill-timesheet.js
$Action = New-ScheduledTaskAction `
	-Execute $NodePath `
	-Argument "`"$ScriptDir\fill-timesheet.js`"" `
	-WorkingDirectory $ScriptDir

# Trigger: weekdays at the specified time, with a random delay up to $RandomDelay
$Trigger = New-ScheduledTaskTrigger -Weekly -DaysOfWeek Monday, Tuesday, Wednesday, Thursday, Friday -At $Time
$Trigger.RandomDelay = [System.Xml.XmlConvert]::ToString([System.TimeSpan]::Parse($RandomDelay))

# Settings: run whether logged in or not, don't stop if on battery
$Settings = New-ScheduledTaskSettingsSet `
	-AllowStartIfOnBatteries `
	-DontStopIfGoingOnBatteries `
	-StartWhenAvailable `
	-RunOnlyIfNetworkAvailable

# Use current user's context
$Principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Limited

# Register (always remove first to avoid Set-ScheduledTask permission issues)
$existing = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if ($existing) {
	Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
}
Register-ScheduledTask -TaskName $TaskName -Action $Action -Trigger $Trigger -Settings $Settings -Principal $Principal | Out-Null
Write-Host "Registered scheduled task '$TaskName' - runs weekdays at $Time."

Write-Host ""
Write-Host "Next steps:"
Write-Host "  1. Run npm run fill:debug first to log in and save your session"
Write-Host "  2. The task will run automatically at $Time on weekdays (+/-$RandomDelay random delay)"
Write-Host "  3. To remove: .\setup-schedule.ps1 -Remove"
Write-Host "  4. To change time: .\setup-schedule.ps1 -Time 17:00"
