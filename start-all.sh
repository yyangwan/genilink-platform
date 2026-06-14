#!/usr/bin/env bash
# Start all local services used by the GeniLink workspace.
# Zhijian/visibility is now deployed remotely and is only health-checked here.

# Disable MSYS2 path conversion for URLs (Git Bash on Windows)
export MSYS_NO_PATHCONV=1
export MSYS2_ARG_CONV_EXCL='*'

set -euo pipefail

die() {
    echo "ERROR: $*" >&2
    exit 1
}

to_windows_path() {
    local path="$1"
    if command -v cygpath >/dev/null 2>&1; then
        cygpath -w "$path"
        return 0
    fi
    if command -v wslpath >/dev/null 2>&1; then
        wslpath -w "$path"
        return 0
    fi
    printf '%s\n' "$path"
}

find_pids_on_port() {
    local port="$1"
    if command -v netstat >/dev/null 2>&1 && command -v grep >/dev/null 2>&1 && command -v awk >/dev/null 2>&1; then
        netstat -ano 2>/dev/null \
            | grep ":${port} " \
            | grep LISTENING \
            | awk '{print $5}' \
            | sort -u \
            | tr -d '\r'
        return 0
    fi
    if command -v powershell.exe >/dev/null 2>&1; then
        powershell.exe -NoLogo -NoProfile -Command \
            "Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique" \
            2>/dev/null \
            | tr -d '\r'
        return 0
    fi
    return 0
}

remote_exec() {
    local remote_command="$1"
    if command -v ssh >/dev/null 2>&1; then
        ssh "$VISIBILITY_REMOTE_SSH_TARGET" "cd '$VISIBILITY_REMOTE_ROOT' && $remote_command"
        return $?
    fi
    if command -v ssh.exe >/dev/null 2>&1; then
        ssh.exe "$VISIBILITY_REMOTE_SSH_TARGET" "cd '$VISIBILITY_REMOTE_ROOT' && $remote_command"
        return $?
    fi
    die "ssh runtime not found; install OpenSSH client or provide an equivalent SSH command"
}

remote_visibility_start() {
    echo "=== Starting remote Visibility service ==="
    remote_exec "docker-compose $VISIBILITY_REMOTE_COMPOSE_FILES up -d backend"
}

remote_visibility_stop() {
    echo "=== Stopping remote Visibility service ==="
    remote_exec "docker-compose $VISIBILITY_REMOTE_COMPOSE_FILES stop backend"
}

remote_visibility_status() {
    echo "=== Remote Visibility status ==="
    remote_exec "docker-compose $VISIBILITY_REMOTE_COMPOSE_FILES ps backend"
}

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORKSPACE_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

PLATFORM_ROOT="${PLATFORM_ROOT:-$SCRIPT_DIR}"
CONTENT_ROOT="${CONTENT_ROOT:-$WORKSPACE_ROOT/marketing}"
VISIBILITY_SERVICE_URL="${VISIBILITY_SERVICE_URL:-https://genilink.cn/visibility}"
VISIBILITY_REMOTE_SSH_TARGET="${VISIBILITY_REMOTE_SSH_TARGET:-root@8.147.56.119}"
VISIBILITY_REMOTE_ROOT="${VISIBILITY_REMOTE_ROOT:-/opt/geo-visibility-analyze}"
VISIBILITY_REMOTE_COMPOSE_FILES="${VISIBILITY_REMOTE_COMPOSE_FILES:--f docker-compose.yml -f docker-compose.prod.yml}"
PLATFORM_DIST_DIR="${PLATFORM_DIST_DIR:-.next-runtime}"
LOG_DIR="${START_ALL_LOG_DIR:-$PLATFORM_ROOT/.run-logs}"
ACTION="${1:-up}"

[ -d "$CONTENT_ROOT" ] || die "Content repo not found: $CONTENT_ROOT (set CONTENT_ROOT to override)"

mkdir -p "$LOG_DIR"

CONTENT_ROOT_WIN="$(to_windows_path "$CONTENT_ROOT")"
PLATFORM_ROOT_WIN="$(to_windows_path "$PLATFORM_ROOT")"
PLATFORM_DIST_DIR_WIN="$(to_windows_path "$PLATFORM_DIST_DIR")"

echo "=== Workspace ==="
echo "  Platform  : $PLATFORM_ROOT"
echo "  Content   : $CONTENT_ROOT"
echo "  Visibility: remote $VISIBILITY_SERVICE_URL"
echo "  Remote SSH: $VISIBILITY_REMOTE_SSH_TARGET"
echo "  Remote Dir : $VISIBILITY_REMOTE_ROOT"
echo "  Logs      : $LOG_DIR"
echo ""

echo "=== Checking Docker container ==="
for container in genilink-postgres; do
    status=$(docker inspect -f '{{.State.Running}}' "$container" 2>/dev/null || echo "false")
    if [ "$status" = "true" ]; then
        echo "  $container is running"
    else
        echo "  starting $container..."
        docker start "$container" 2>/dev/null || echo "  failed to start $container"
    fi
done
sleep 2

PORTS=(3001 4002)
PIDS=()

stop_local_services() {
    echo "=== Stopping local services ==="
    for port in "${PORTS[@]}"; do
        pids="$(find_pids_on_port "$port")"
        if [ -n "$pids" ]; then
            for pid in $pids; do
                echo "  port $port in use by PID $pid, terminating..."
                powershell.exe -NoLogo -NoProfile -Command "Stop-Process -Id $pid -Force -ErrorAction SilentlyContinue" >/dev/null 2>&1 || true
            done
        else
            echo "  port $port is free"
        fi
    done
}

wait_for_remote_visibility() {
    local url="$1"
    local timeout_seconds="${2:-60}"
    local elapsed=0
    while [ "$elapsed" -lt "$timeout_seconds" ]; do
        if powershell.exe -NoLogo -NoProfile -Command "
            [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12 -bor [Net.SecurityProtocolType]::Tls13
            try {
                \$response = Invoke-WebRequest -Uri '$url' -TimeoutSec 5
                if (\$response.StatusCode -ge 200 -and \$response.StatusCode -lt 300) { exit 0 }
                exit 1
            } catch {
                exit 1
            }
        " >/dev/null 2>&1; then
            echo "  OK   Visibility service is reachable: $url"
            return 0
        fi
        sleep 2
        elapsed=$((elapsed + 2))
    done
    echo "  FAIL Visibility service did not respond within ${timeout_seconds}s: $url"
    return 1
}

case "$ACTION" in
    status)
        echo "=== Local service status ==="
        for port in "${PORTS[@]}"; do
            pids="$(find_pids_on_port "$port")"
            if [ -n "$pids" ]; then
                echo "  port $port: running (PID(s): $pids)"
            else
                echo "  port $port: stopped"
            fi
        done
        remote_visibility_status
        exit 0
        ;;
    stop)
        stop_local_services
        remote_visibility_stop
        echo ""
        echo "=== Services stopped ==="
        exit 0
        ;;
    stop-visibility)
        remote_visibility_stop
        exit 0
        ;;
    status-visibility)
        remote_visibility_status
        wait_for_remote_visibility "$VISIBILITY_SERVICE_URL/api/health"
        exit 0
        ;;
    restart-visibility)
        remote_visibility_stop
        remote_visibility_start
        wait_for_remote_visibility "$VISIBILITY_SERVICE_URL/api/health"
        exit 0
        ;;
    restart)
        stop_local_services
        remote_visibility_stop
        ;;
esac

echo "=== Releasing target ports ==="
for port in "${PORTS[@]}"; do
    pids="$(find_pids_on_port "$port")"
    if [ -n "$pids" ]; then
        for pid in $pids; do
            echo "  port $port in use by PID $pid, terminating..."
            powershell.exe -NoLogo -NoProfile -Command "Stop-Process -Id $pid -Force -ErrorAction SilentlyContinue" >/dev/null 2>&1 || true
        done
    else
        echo "  port $port is free"
    fi
done

echo ""
echo "=== Starting services ==="

echo "[1/2] Building Content (port 4002)..."
# Clean build cache to avoid path separator issues on Windows (E:/ vs E:\)
powershell.exe -NoLogo -NoProfile -Command "& { Set-Location '$CONTENT_ROOT_WIN'; if (Test-Path '.next') { Remove-Item -Recurse -Force '.next' -ErrorAction SilentlyContinue; Start-Sleep -Milliseconds 500 } }" >/dev/null 2>&1
powershell.exe -NoLogo -NoProfile -Command "& { Set-Location '$CONTENT_ROOT_WIN'; \$env:NODE_OPTIONS='--max-old-space-size=4096'; npm.cmd run build }" \
    >"$LOG_DIR/content-build.out.log" 2>"$LOG_DIR/content-build.err.log"
# Check if build succeeded
if ! grep -q "Compiled successfully\|Creating an optimized" "$LOG_DIR/content-build.out.log" 2>/dev/null; then
    echo "  FAIL Content build failed - check $LOG_DIR/content-build.err.log"
    cat "$LOG_DIR/content-build.err.log" >&2
    exit 1
fi
echo "[1/2] Starting Content (port 4002)..."
powershell.exe -NoLogo -NoProfile -Command "& { Set-Location '$CONTENT_ROOT_WIN'; npm.cmd run start -- -p 4002 }" \
    >"$LOG_DIR/content.out.log" 2>"$LOG_DIR/content.err.log" &
CONTENT_PID=$!
PIDS+=("$CONTENT_PID")
echo "      PID: $CONTENT_PID"

echo "[2/2] Building Frontend (port 3001)..."
powershell.exe -NoLogo -NoProfile -Command "& { Set-Location '$PLATFORM_ROOT_WIN'; \$env:NODE_OPTIONS='--max-old-space-size=4096'; \$env:NEXT_DIST_DIR='$PLATFORM_DIST_DIR'; npm.cmd run build }" \
    >"$LOG_DIR/frontend-build.out.log" 2>"$LOG_DIR/frontend-build.err.log"
echo "[2/2] Starting Frontend (port 3001)..."
powershell.exe -NoLogo -NoProfile -Command "& { Set-Location '$PLATFORM_ROOT_WIN'; \$env:NEXT_DIST_DIR='$PLATFORM_DIST_DIR'; \$env:BILLING_DISABLED='true'; \$env:VISIBILITY_SERVICE_URL='$VISIBILITY_SERVICE_URL'; npm.cmd run start -- -p 3001 }" \
    >"$LOG_DIR/frontend.out.log" 2>"$LOG_DIR/frontend.err.log" &
FRONTEND_PID=$!
PIDS+=("$FRONTEND_PID")
echo "      PID: $FRONTEND_PID"

echo ""
echo "=== Waiting for services ==="

fetch_http_body() {
    local url="$1"
    powershell.exe -NoLogo -NoProfile -Command "
        try {
            \$response = Invoke-WebRequest -UseBasicParsing -Uri '$url' -TimeoutSec 5
            \$response.Content
            exit 0
        } catch {
            if (\$_.Exception.Response -ne \$null) {
                \$stream = \$_.Exception.Response.GetResponseStream()
                if (\$stream -ne \$null) {
                    \$reader = New-Object System.IO.StreamReader(\$stream)
                    \$reader.ReadToEnd()
                }
                exit 0
            }
            exit 1
        }
    " 2>/dev/null
}

fetch_http_ok_body() {
    local url="$1"
    powershell.exe -NoLogo -NoProfile -Command "
        try {
            \$response = Invoke-WebRequest -UseBasicParsing -Uri '$url' -TimeoutSec 5
            if (\$response.StatusCode -ge 200 -and \$response.StatusCode -lt 300) {
                \$response.Content
                exit 0
            }
            exit 1
        } catch {
            exit 1
        }
    " 2>/dev/null
}

wait_for_service() {
    local name="$1"
    local port="$2"
    local timeout_seconds="${3:-60}"
    local elapsed=0
    while [ "$elapsed" -lt "$timeout_seconds" ]; do
        if fetch_http_body "http://127.0.0.1:${port}/" >/dev/null 2>&1; then
            echo "  OK   $name (port $port) is responding"
            return 0
        fi
        sleep 2
        elapsed=$((elapsed + 2))
    done
    echo "  FAIL $name (port $port) did not respond within ${timeout_seconds}s"
    return 1
}

check_frontend_static_assets() {
    local name="$1"
    local port="$2"
    local timeout_seconds="${3:-60}"
    local elapsed=0

    while [ "$elapsed" -lt "$timeout_seconds" ]; do
        # Simplified check: just verify the homepage returns 200 and contains HTML content
        result=$(powershell.exe -NoLogo -NoProfile -Command "
            try {
                \$response = Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:${port}/' -TimeoutSec 5
                if (\$response.StatusCode -ge 200 -and \$response.StatusCode -lt 300) {
                    \$html = \$response.Content
                    # Check if HTML contains expected elements
                    if (\$html -match '<html' -and \$html -match '_next/static') {
                        Write-Host 'OK'
                        exit 0
                    } else {
                        exit 1
                    }
                }
                exit 1
            } catch {
                exit 1
            }
        " 2>&1)

        if echo "$result" | grep -q '^OK$'; then
            echo "  OK   $name is serving content correctly"
            return 0
        fi

        sleep 2
        elapsed=$((elapsed + 2))
    done

    echo "  FAIL $name (port $port) - did not serve valid content within ${timeout_seconds}s"
    return 1
}

wait_for_service "Frontend" 3001
check_frontend_static_assets "Frontend" 3001
wait_for_service "Content" 4002
remote_visibility_start
wait_for_remote_visibility "$VISIBILITY_SERVICE_URL/api/health"

echo ""
echo "=== All services started ==="
echo "  Frontend   : http://localhost:3001"
echo "  Content    : http://localhost:4002"
echo "  Visibility : remote $VISIBILITY_SERVICE_URL"
echo ""
echo "Logs are in: $LOG_DIR"
echo "PIDs: frontend=$FRONTEND_PID, content=$CONTENT_PID"
echo "Stop all: taskkill /F /PID $FRONTEND_PID /PID $CONTENT_PID"
