#!/bin/bash
# GeniLink Platform — 启动所有服务
# 智链 (Frontend):  port 3001
# 智创 (Content):   port 4002
# 智见 (Visibility): port 8000

set -e

# ── Start Docker dependencies ──
echo "=== 检查 Docker 容器 ==="
for container in genilink-postgres; do
    status=$(docker inspect -f '{{.State.Running}}' "$container" 2>/dev/null || echo "false")
    if [ "$status" = "true" ]; then
        echo "  $container — 运行中 ✓"
    else
        echo "  $container — 启动中..."
        docker start "$container" 2>/dev/null || echo "  ⚠ $container 启动失败"
    fi
done
sleep 2

PORTS=(3001 4002 8000)
SERVICES=("智链-Frontend" "智创-Content" "智见-Visibility")

# ── Kill processes occupying target ports ──
echo "=== 检查端口占用 ==="
for i in "${!PORTS[@]}"; do
    port=${PORTS[$i]}
    pids=$(netstat -ano 2>/dev/null | grep ":${port} " | grep LISTENING | awk '{print $5}' | sort -u)
    if [ -n "$pids" ]; then
        for pid in $pids; do
            echo "  端口 ${port} 被占用 (PID ${pid})，正在杀掉..."
            taskkill //F //PID "$pid" 2>/dev/null || true
        done
    else
        echo "  端口 ${port} 空闲 ✓"
    fi
done

echo ""
echo "=== 启动服务 ==="

# ── 1. 智见 (Visibility Backend) — FastAPI on :8000 ──
echo "[1/3] 启动 智见 (port 8000)..."
cd "E:/workspace/geo-visibility-analyze/backend"
NO_PROXY="*" uvicorn app.main:app --host 0.0.0.0 --port 8000 > /dev/null 2>&1 &
ZHIJIAN_PID=$!
echo "      PID: $ZHIJIAN_PID"

# ── 2. 智创 (Content Service) — Next.js on :4002 ──
echo "[2/3] 构建 智创 (port 4002)..."
powershell.exe -NoLogo -NoProfile -Command "Set-Location 'E:/workspace/marketing'; npm.cmd run build" > /dev/null 2>&1
echo "[2/3] 启动 智创 (port 4002)..."
powershell.exe -NoLogo -NoProfile -Command "Set-Location 'E:/workspace/marketing'; npm.cmd run start -- -p 4002" > /dev/null 2>&1 &
ZHICHUANG_PID=$!
echo "      PID: $ZHICHUANG_PID"

# ── 3. 智链 (Frontend) — Next.js on :3001 ──
echo "[3/3] 构建 智链 (port 3001)..."
PLATFORM_DIST_DIR=".next-runtime"
powershell.exe -NoLogo -NoProfile -Command "Set-Location 'E:/workspace/genilink-platform'; \$env:NEXT_DIST_DIR='$PLATFORM_DIST_DIR'; npm.cmd run build" > /dev/null 2>&1
echo "[3/3] 启动 智链 (port 3001)..."
powershell.exe -NoLogo -NoProfile -Command "Set-Location 'E:/workspace/genilink-platform'; \$env:NEXT_DIST_DIR='$PLATFORM_DIST_DIR'; npm.cmd run start -- -p 3001" > /dev/null 2>&1 &
ZHILIAN_PID=$!
echo "      PID: $ZHILIAN_PID"

echo ""
echo "=== 等待服务就绪 ==="
sleep 3

# ── Health check ──
check_service() {
    local name=$1 port=$2
    if curl -s --noproxy "*" --max-time 3 "http://localhost:${port}" > /dev/null 2>&1; then
        echo "  ✓ ${name} (port ${port}) — 运行中"
    else
        echo "  ✗ ${name} (port ${port}) — 启动中..."
    fi
}

check_service "智链-Frontend" 3001
check_service "智创-Content"  4002
check_service "智见-Visibility" 8000

echo ""
echo "=== 所有服务已启动 ==="
echo "  智链 Frontend : http://localhost:3001"
echo "  智创 Content  : http://localhost:4002"
echo "  智见 Visibility: http://localhost:8000"
echo ""
echo "PIDs: 智见=$ZHIJIAN_PID, 智创=$ZHICHUANG_PID, 智链=$ZHILIAN_PID"
echo "停止所有服务: kill $ZHIJIAN_PID $ZHICHUANG_PID $ZHILIAN_PID"
