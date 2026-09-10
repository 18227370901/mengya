#!/bin/bash
# ============================================================
# 萌芽（mengya）平台服务管理脚本
#
# 用法：
#   ./run.sh                启动全部服务（同 start）
#   ./run.sh start          启动全部服务（后端 + 前端）
#   ./run.sh stop           停止全部服务
#   ./run.sh restart        重启全部服务
#   ./run.sh status         查看服务运行状态
#   ./run.sh add_nginx      生成 nginx SSL 配置（需单独手动执行）
#   ./run.sh help           显示帮助
#
# 可自定义的配置项（通过环境变量传入，均有默认值）：
#   ADMIN_USERNAME    管理员账号（手机号或用户名，默认 13800000001）
#   ADMIN_PASSWORD    管理员密码（默认 admin123）
#   ADMIN_NICKNAME    管理员昵称（默认 管理员）
#   BACKEND_PORT      后端服务端口（默认 8000）
#   FRONTEND_PORT     前端服务端口（默认 5173）
#   EXTERNAL_PORT     外部访问端口（默认 10224，nginx SSL 反代）
#
# 用法示例：
#   ./run.sh start
#   ADMIN_USERNAME=admin_yy ADMIN_PASSWORD=mypassword ./run.sh start
#   BACKEND_PORT=9000 EXTERNAL_PORT=20448 ./run.sh start
#   ./run.sh add_nginx
# ============================================================

set -e

# ===== 配置项（可从环境变量覆盖）=====
export ADMIN_USERNAME="${ADMIN_USERNAME:-13800000001}"
export ADMIN_PASSWORD="${ADMIN_PASSWORD:-admin123}"
export ADMIN_NICKNAME="${ADMIN_NICKNAME:-管理员}"
export BACKEND_PORT="${BACKEND_PORT:-8000}"
export FRONTEND_PORT="${FRONTEND_PORT:-5173}"
export EXTERNAL_PORT="${EXTERNAL_PORT:-10224}"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BACKEND_DIR="$SCRIPT_DIR/backend"
FRONTEND_DIR="$SCRIPT_DIR/frontend"
NGINX_CONF="$SCRIPT_DIR/nginx/mengya_ssl.conf"
NGINX_CERT_DIR="$SCRIPT_DIR/nginx/ssl"
PID_DIR="$SCRIPT_DIR/.run"
BACKEND_PID_FILE="$PID_DIR/backend.pid"
FRONTEND_PID_FILE="$PID_DIR/frontend.pid"
LOG_DIR="$SCRIPT_DIR/logs"

# ===== 工具函数 =====

port_in_use() {
    local port="$1"
    if command -v ss >/dev/null 2>&1; then
        ss -ltn 2>/dev/null | grep -qE "[:.]$port[[:space:]]" && return 0
    fi
    if command -v lsof >/dev/null 2>&1; then
        lsof -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1 && return 0
    fi
    return 1
}

pid_alive() {
    local pid="$1"
    local keyword="$2"
    [ -z "$pid" ] && return 1
    [ ! -d "/proc/$pid" ] && return 1
    if [ -n "$keyword" ]; then
        local cmdline
        cmdline=$(tr '\0' ' ' < "/proc/$pid/cmdline" 2>/dev/null || true)
        echo "$cmdline" | grep -q "$keyword" || return 1
    fi
    return 0
}

read_pid() {
    local pidfile="$1"
    local keyword="$2"
    local pid=""
    if [ -f "$pidfile" ]; then
        pid=$(cat "$pidfile" 2>/dev/null | tr -d '[:space:]' || true)
    fi
    if pid_alive "$pid" "$keyword"; then
        echo "$pid"
    else
        echo ""
    fi
}

get_backend_pid() { read_pid "$BACKEND_PID_FILE" "manage.py runserver"; }
get_frontend_pid() { read_pid "$FRONTEND_PID_FILE" "vite"; }

# ===== 生成 nginx 配置 =====
gen_nginx_config() {
    echo "==> 生成 nginx SSL 配置"
    mkdir -p "$NGINX_CERT_DIR"

    if [ ! -f "$NGINX_CERT_DIR/mengya.crt" ]; then
        echo "  生成自签名 SSL 证书..."
        if command -v openssl >/dev/null 2>&1; then
            openssl req -x509 -newkey rsa:2048 -keyout "$NGINX_CERT_DIR/mengya.key" \
                -out "$NGINX_CERT_DIR/mengya.crt" -days 365 -nodes \
                -subj "/C=CN/O=mengya/CN=localhost" 2>/dev/null || true
        else
            echo "  [警告] 未找到 openssl，跳过证书生成"
        fi
    fi

    cat > "$NGINX_CONF" << EOF
server {
    listen $EXTERNAL_PORT ssl;
    server_name localhost;

    ssl_certificate     $NGINX_CERT_DIR/mengya.crt;
    ssl_certificate_key $NGINX_CERT_DIR/mengya.key;
    ssl_protocols       TLSv1.2 TLSv1.3;
    ssl_ciphers         HIGH:!aNULL:!MD5;
    ssl_session_cache    shared:SSL:10m;
    ssl_session_timeout  10m;

    add_header X-Frame-Options DENY;
    add_header X-Content-Type-Options nosniff;
    client_max_body_size 20M;

    # 前端
    location / {
        proxy_pass http://127.0.0.1:$FRONTEND_PORT;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
    }

    # 后端 API
    location /api/ {
        proxy_pass http://127.0.0.1:$BACKEND_PORT;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }

    # Django Admin
    location /admin/ {
        proxy_pass http://127.0.0.1:$BACKEND_PORT;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    }
}
EOF

    echo "  nginx 配置已生成: $NGINX_CONF"
    echo "  SSL 证书目录: $NGINX_CERT_DIR"
    echo ""
    echo "  在已安装 nginx 的服务器上执行:"
    echo "    nginx -c $NGINX_CONF"
    echo ""
    echo "  或使用 Docker:"
    echo "    docker run -d -p $EXTERNAL_PORT:$EXTERNAL_PORT \\"
    echo "      -v $NGINX_CONF:/etc/nginx/conf.d/default.conf \\"
    echo "      -v $NGINX_CERT_DIR:/etc/nginx/ssl nginx:alpine"
}

# ===== 启动后端 =====
start_backend() {
    echo "==> 启动后端 Django（端口 $BACKEND_PORT）"
    if port_in_use "$BACKEND_PORT"; then
        echo "  [提示] 端口 $BACKEND_PORT 已被占用，跳过后端启动"
        echo "         请确认占用进程是否为旧实例，必要时先执行 ./run.sh stop"
        return 1
    fi

    cd "$BACKEND_DIR"
    if [ -d ".venv/bin" ]; then
        PYTHON="$BACKEND_DIR/.venv/bin/python"
    elif [ -d "venv/bin" ]; then
        PYTHON="$BACKEND_DIR/venv/bin/python"
    else
        PYTHON="python"
    fi

    if [ ! -d ".venv" ] && [ ! -d "venv" ] && [ -z "$SKIP_VENV" ]; then
        echo "  创建虚拟环境..."
        python -m venv .venv
        PYTHON="$BACKEND_DIR/.venv/bin/python"
        "$PYTHON" -m pip install -r requirements.txt
    fi

    echo "  执行数据库迁移..."
    "$PYTHON" manage.py migrate --noinput 2>/dev/null || true
    echo "  初始化种子数据..."
    "$PYTHON" manage.py init_data --skip-if-exists 2>/dev/null || true
    "$PYTHON" manage.py init_fetal_stories --skip-if-exists 2>/dev/null || true
    "$PYTHON" manage.py ensure_admin 2>/dev/null || true

    mkdir -p "$LOG_DIR" "$PID_DIR"
    nohup "$PYTHON" manage.py runserver 127.0.0.1:$BACKEND_PORT \
        >> "$LOG_DIR/backend.log" 2>&1 &
    echo $! > "$BACKEND_PID_FILE"
    echo "  后端 PID: $(cat "$BACKEND_PID_FILE")"
    echo "  日志: $LOG_DIR/backend.log"
}

# ===== 启动前端 =====
start_frontend() {
    echo "==> 启动前端 Vite（端口 $FRONTEND_PORT）"
    if port_in_use "$FRONTEND_PORT"; then
        echo "  [提示] 端口 $FRONTEND_PORT 已被占用，跳过前端启动"
        echo "         请确认占用进程是否存在，必要时请执行 ./run.sh stop"
        return 1
    fi

    cd "$FRONTEND_DIR"
    if [ ! -d "node_modules" ]; then
        echo "  安装前端依赖..."
        npm install
    fi

    mkdir -p "$LOG_DIR" "$PID_DIR"
    nohup npm run dev -- --port $FRONTEND_PORT \
        >> "$LOG_DIR/frontend.log" 2>&1 &
    echo $! > "$FRONTEND_PID_FILE"
    echo "  前端 PID: $(cat "$FRONTEND_PID_FILE")"
    echo "  日志: $LOG_DIR/frontend.log"
}

# ===== 停止单个服务 =====
stop_service() {
    local pid="$1"
    local name="$2"
    local pidfile="$3"
    if [ -n "$pid" ]; then
        echo "  ==> 停止 $name (PID $pid)"
        kill "$pid" 2>/dev/null || true
        for _ in $(seq 1 10); do
            pid_alive "$pid" "" || break
            sleep 0.5
        done
        kill -9 "$pid" 2>/dev/null || true
        rm -f "$pidfile"
    else
        echo "  $name 未在运行（无有效 PID）"
    fi
}

# ===== 停止全部 =====
stop_all() {
    echo "==> 停止服务"
    stop_service "$(get_backend_pid)" "后端 Django" "$BACKEND_PID_FILE"
    stop_service "$(get_frontend_pid)" "前端 Vite" "$FRONTEND_PID_FILE"
    echo "  服务已停止"
}

# ===== 状态查询 =====
show_status() {
    echo "============================================"
    echo "  萌芽（mengya）平台"
    echo "============================================"
    local bp fp
    bp=$(get_backend_pid)
    fp=$(get_frontend_pid)

    echo "  后端 Django  : $([ -n "$bp" ] && echo "运行中 (PID $bp, 端口 $BACKEND_PORT)" || echo "未运行")"
    echo "  前端 Vite    : $([ -n "$fp" ] && echo "运行中 (PID $fp, 端口 $FRONTEND_PORT)" || echo "未运行")"
    echo "  nginx 配置   : $([ -f "$NGINX_CONF" ] && echo "已生成 ($NGINX_CONF)" || echo "未生成")"
    echo "  日志目录     : $LOG_DIR"
    echo ""

    local note=0
    if port_in_use "$BACKEND_PORT"; then
        echo "  [提示] 端口 $BACKEND_PORT 有进程监听，但不在本脚本管理范围内（PID 文件不匹配）"
        note=1
    fi
    if port_in_use "$FRONTEND_PORT"; then
        echo "  [提示] 端口 $FRONTEND_PORT 有进程监听，但不在本脚本管理范围内"
        note=1
    fi
    [ "$note" = "1" ] && echo "         如为残留进程，请手动排查或使用 restart 重启。"
    echo ""
}

# ===== 命令分发 =====
CMD="${1:-start}"
case "$CMD" in
    start|"")
        start_backend
        start_frontend
        show_status
        echo "============================================"
        echo "  启动完成！"
        echo "  内部访问: http://localhost:$BACKEND_PORT (后端) / http://localhost:$FRONTEND_PORT (前端)"
        echo "  管理员账号: $ADMIN_USERNAME / $ADMIN_PASSWORD"
        echo "============================================"
        ;;
    stop)
        stop_all
        ;;
    restart)
        stop_all
        echo ""
        echo "==> 重新启动..."
        sleep 1
        start_backend
        start_frontend
        show_status
        echo "============================================"
        echo "  重启完成！"
        echo "  内部访问: http://localhost:$BACKEND_PORT / http://localhost:$FRONTEND_PORT"
        echo "  管理员账号: $ADMIN_USERNAME / $ADMIN_PASSWORD"
        echo "============================================"
        ;;
    status)
        show_status
        ;;
    add_nginx)
        gen_nginx_config
        ;;
    -h|--help|help)
        sed -n '1,30p' "$0" | sed 's/^# \{0,1\}//'
        ;;
    *)
        echo "未知命令: $CMD"
        echo "用法: ./run.sh [start|stop|restart|status|add_nginx|help]"
        exit 1
        ;;
esac
