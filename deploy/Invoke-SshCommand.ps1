# PowerShell SSH helper for GeniLink deployment
# Usage: .\Invoke-SshCommand.ps1 "command"

param(
    [Parameter(Mandatory=$true)]
    [string]$Command,

    [string]$Server = "root@8.147.56.119",
    [string]$Password = "abcXYZ@0123",
    [int]$TimeoutSeconds = 300
)

# Create secure password
$securePassword = ConvertTo-SecureString $Password -AsPlainText -Force
$credential = New-Object System.Management.Automation.PSCredential ($Server.Split('@')[0], $securePassword)

# Use plink if available (PuTTY)
$plinkPath = "C:\Program Files\PuTTY\plink.exe"
if (Test-Path $plinkPath) {
    & $plinkPath -ssh -pw $Password "$Server" $Command
    exit $LASTEXITCODE
}

# Use OpenSSH if available
$sshPath = "C:\Program Files\OpenSSH-Win64\ssh.exe"
if (Test-Path $sshPath) {
    # For OpenSSH, we need to use sshpass or expect
    # Since Windows doesn't have sshpass, we'll use a different approach
    # Create a temporary batch file with the command

    # Actually, let's try using the ssh command directly
    # It will prompt for password, so we need a different method
    & $sshPath -o StrictHostKeyChecking=no -o ConnectTimeout=$TimeoutSeconds $Server $Command
    exit $LASTEXITCODE
}

# Fallback: try ssh from PATH
try {
    & ssh -o StrictHostKeyChecking=no -o ConnectTimeout=$TimeoutSeconds $Server $Command
    exit $LASTEXITCODE
} catch {
    Write-Error "SSH not available. Please install OpenSSH or PuTTY."
    exit 1
}
