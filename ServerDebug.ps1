# Enhanced HTTP Server Starter with Comprehensive Debugging
param(
    [int]$Port = 8000,
    [string]$RootDirectory = $PWD,
    [switch]$LogToFile,
    [switch]$Verbose
)

# Configuration
$ServerURL = "http://localhost:$Port/"
$LogFile = "server_debug_$(Get-Date -Format 'yyyyMMdd_HHmmss').log"
$StartTime = Get-Date

# Functions
function Write-Log {
    param([string]$Message, [string]$Type = "INFO")
    
    $Timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $LogEntry = "[$Timestamp] [$Type] $Message"
    
    Write-Host $LogEntry -ForegroundColor $(switch($Type) {
        "ERROR" { "Red" }
        "WARNING" { "Yellow" }
        "SUCCESS" { "Green" }
        "DEBUG" { "Cyan" }
        default { "White" }
    })
    
    if ($LogToFile) {
        $LogEntry | Out-File -FilePath $LogFile -Append -Encoding UTF8
    }
}

function Test-Python {
    try {
        $PythonVersion = python --version 2>&1
        if ($LASTEXITCODE -eq 0) {
            Write-Log "Python found: $PythonVersion" "SUCCESS"
            return $true
        }
    }
    catch {
        Write-Log "Python check failed: $($_.Exception.Message)" "DEBUG"
    }
    return $false
}

function Get-SystemInfo {
    Write-Log "=== SYSTEM INFORMATION ===" "DEBUG"
    Write-Log "PowerShell Version: $($PSVersionTable.PSVersion)" "DEBUG"
    Write-Log "OS: $([System.Environment]::OSVersion.VersionString)" "DEBUG"
    Write-Log "Current User: $([System.Environment]::UserName)" "DEBUG"
    Write-Log "Machine Name: $([System.Environment]::MachineName)" "DEBUG"
    Write-Log "Working Directory: $RootDirectory" "DEBUG"
    Write-Log "Script Directory: $PSScriptRoot" "DEBUG"
}

function Test-PortAvailability {
    param([int]$Port)
    
    try {
        $Listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, $Port)
        $Listener.Start()
        $Listener.Stop()
        Write-Log "Port $Port is available" "SUCCESS"
        return $true
    }
    catch {
        Write-Log "Port $Port is already in use: $($_.Exception.Message)" "ERROR"
        return $false
    }
}

function Start-HTTPServer {
    param([int]$Port, [string]$Directory)
    
    Write-Log "Starting HTTP server on port $Port" "INFO"
    Write-Log "Serving directory: $Directory" "INFO"
    
    # Create server process with detailed output
    $ServerProcess = Start-Process -FilePath "python" `
        -ArgumentList @("-m", "http.server", $Port.ToString()) `
        -WorkingDirectory $Directory `
        -PassThru `
        -NoNewWindow `
        -RedirectStandardOutput "server_stdout.log" `
        -RedirectStandardError "server_stderr.log"
    
    return $ServerProcess
}

function Monitor-Server {
    param([System.Diagnostics.Process]$Process, [int]$Port)
    
    $ServerStartTime = Get-Date
    $MaxWaitTime = 30 # seconds
    
    Write-Log "Monitoring server startup..." "DEBUG"
    
    for ($i = 0; $i -lt $MaxWaitTime; $i++) {
        Start-Sleep -Seconds 1
        
        # Check if process is still running
        if ($Process.HasExited) {
            Write-Log "Server process exited unexpectedly with code: $($Process.ExitCode)" "ERROR"
            if (Test-Path "server_stderr.log") {
                $ErrorContent = Get-Content "server_stderr.log" -Raw
                Write-Log "Server error output: $ErrorContent" "ERROR"
            }
            return $false
        }
        
        # Test if server is responding
        try {
            $Response = Invoke-WebRequest -Uri $ServerURL -TimeoutSec 1 -ErrorAction Stop
            $ResponseTime = (Get-Date) - $ServerStartTime
            Write-Log "Server responded successfully after $([math]::Round($ResponseTime.TotalSeconds, 2)) seconds" "SUCCESS"
            Write-Log "HTTP Status: $($Response.StatusCode) $($Response.StatusDescription)" "DEBUG"
            return $true
        }
        catch {
            if ($Verbose) {
                Write-Log "Server not ready yet... (attempt $($i + 1)/$MaxWaitTime)" "DEBUG"
            }
        }
    }
    
    Write-Log "Server failed to start within $MaxWaitTime seconds" "WARNING"
    return $false
}

function Show-RealTimeLogs {
    Write-Log "=== REAL-TIME MONITORING ===" "INFO"
    Write-Log "Press 'R' to refresh server status" "INFO"
    Write-Log "Press 'L' to show recent access logs" "INFO"
    Write-Log "Press 'S' to show server process info" "INFO"
    Write-Log "Press 'Q' to quit monitoring" "INFO"
    Write-Log "Server URL: $ServerURL" "SUCCESS"
}

function Get-ServerStatus {
    try {
        $Response = Invoke-WebRequest -Uri $ServerURL -TimeoutSec 2 -ErrorAction Stop
        Write-Log "Server Status: ONLINE - $($Response.StatusCode)" "SUCCESS"
        Write-Log "Content Type: $($Response.Headers['Content-Type'])" "DEBUG"
        Write-Log "Server Header: $($Response.Headers['Server'])" "DEBUG"
    }
    catch {
        Write-Log "Server Status: OFFLINE - $($_.Exception.Message)" "ERROR"
    }
}

# Main Execution
Clear-Host
Write-Log "=== HTTP SERVER STARTUP DEBUGGER ===" "INFO"
Write-Log "Start Time: $StartTime" "INFO"

# System information
Get-SystemInfo

# Pre-flight checks
Write-Log "=== PRE-FLIGHT CHECKS ===" "INFO"

if (-not (Test-Python)) {
    Write-Log "Python is not installed or not in PATH" "ERROR"
    Write-Log "Download Python from: https://python.org" "INFO"
    pause
    exit 1
}

if (-not (Test-PortAvailability -Port $Port)) {
    Write-Log "Please choose a different port or stop the conflicting service" "ERROR"
    pause
    exit 1
}

if (-not (Test-Path $RootDirectory)) {
    Write-Log "Root directory does not exist: $RootDirectory" "ERROR"
    pause
    exit 1
}

# Start server
Write-Log "=== SERVER STARTUP ===" "INFO"
$ServerProcess = Start-HTTPServer -Port $Port -Directory $RootDirectory

# Monitor startup
if (Monitor-Server -Process $ServerProcess -Port $Port) {
    # Open browser
    try {
        Start-Process $ServerURL
        Write-Log "Browser opened: $ServerURL" "SUCCESS"
    }
    catch {
        Write-Log "Failed to open browser: $($_.Exception.Message)" "WARNING"
    }
    
    # Interactive monitoring
    do {
        Show-RealTimeLogs
        $Key = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
        
        switch ($Key.Character.ToString().ToUpper()) {
            'R' { 
                Clear-Host
                Get-ServerStatus 
            }
            'L' {
                Write-Log "=== RECENT ACCESS LOGS ===" "INFO"
                if (Test-Path "server_stdout.log") {
                    Get-Content "server_stdout.log" -Tail 10 | ForEach-Object { 
                        Write-Log "ACCESS: $_" "DEBUG" 
                    }
                }
            }
            'S' {
                Write-Log "=== SERVER PROCESS INFO ===" "INFO"
                Write-Log "Process ID: $($ServerProcess.Id)" "DEBUG"
                Write-Log "Start Time: $($ServerProcess.StartTime)" "DEBUG"
                Write-Log "CPU Time: $($ServerProcess.TotalProcessorTime)" "DEBUG"
                Write-Log "Memory Usage: $([math]::Round($ServerProcess.WorkingSet64 / 1MB, 2)) MB" "DEBUG"
            }
        }
    } while ($Key.Character.ToString().ToUpper() -ne 'Q')
    
    # Cleanup
    Write-Log "Stopping server..." "INFO"
    $ServerProcess.Kill()
    $ServerProcess.WaitForExit(5000)
    
    if ($ServerProcess.HasExited) {
        Write-Log "Server stopped successfully" "SUCCESS"
    } else {
        Write-Log "Warning: Server may not have stopped cleanly" "WARNING"
    }
} else {
    Write-Log "Server startup failed. Check logs for details." "ERROR"
}

Write-Log "=== SESSION SUMMARY ===" "INFO"
$EndTime = Get-Date
$Duration = $EndTime - $StartTime
Write-Log "End Time: $EndTime" "INFO"
Write-Log "Total Duration: $([math]::Round($Duration.TotalMinutes, 2)) minutes" "INFO"

if ($LogToFile) {
    Write-Log "Detailed logs saved to: $LogFile" "INFO"
}

Write-Log "Press any key to exit..." "INFO"
pause