#!/bin/bash
# ============================================================
# 萌芽（mengya）平台服务管理脚本
#
# 用法：
#   ./run.sh               无参数：显示使用提示并退出（不启动服务）
#   ./run.sh start          启动全部服务（交互式选择启动方式）
#   ./run.sh stop           停止全部服务
#   ./run.sh restart        重启全部服务
#   ./run.sh status         查看服务运行状态
#   ./run.sh add_nginx      生成 nginx SSL 配置（需单独手动执行）
#   ./run.sh help           显示帮助
#
# 说明：
#   - 支持 ./run.sh 或 sh run.sh 方式执行（自动改用 bash 运行本脚本）
#   - 无参数直接回车时，仅显示使用提示并退出，不执行任何操作
#
# 启动方式（二选一）：
#   MODE=docker   使用 docker compose（推荐，适合服务器/容器环境）
#   MODE=local    传统方式启动（本机 python3 + vite，适合本地开发）
#
# 执行 start/restart 时：
#   - 若已设置 MODE 环境变量，则直接使用该方式
#   - 若未设置，则交互式提示选择（并记住上次选择）
#   - 传统方式下会自动校验依赖（python 包 / node_modules），缺失则自动安装
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
#   ./run.sh
#   ./run.sh start
#   MODE=docker ./run.sh start                      # docker compose 启动
#   MODE=local ./run.sh start                       # 传统方式启动
#   ADMIN_USERNAME=admin_yy ADMIN_PASSWORD=mypassword MODE=local ./run.sh start
#   BACKEND_PORT=9000 EXTERNAL_PORT=20448 ./run.sh start
#   ./run.sh restart
#   ./run.sh stop
#   ./run.sh status
#   ./run.sh add_nginx
# ============================================================

set -e

# ===== bash 兼容：若使用 sh 执行（如 dash），自动改用 bash 重新执行 =====
# 脚本内使用了 read -p、local 等 bash 语法，sh（dash）下会报错，
# 因此检测到非 bash 解释器时，自动 exec bash 重新运行，保证 sh run.sh 也可用。
if [ -z "$BASH_VERSION" ]; then
    if command -v bash >/dev/null 2>&1; then
        exec bash "$0" "$@"
    else
        echo "[错误] 未找到 bash，请使用: bash run.sh 运行本脚本" >&2
        exit 1
    fi
fi

# ===== 配置项（可从环境变量覆盖）=====
export ADMIN_USERNAME="${ADMIN_USERNAME:-13800000001}"
export ADMIN_PASSWORD="${ADMIN_PASSWORD:-admin123}"
export ADMIN_NICKNAME="${ADMIN_NICKNAME:-管理员}"
export BACKEND_PORT="${BACKEND_PORT:-8000}"
export FRONTEND_PORT="${FRONTEND_PORT:-5173}"
export EXTERNAL_PORT="${EXTERNAL_PORT:-10224}"
# 启动方式：不设默认值。start/restart 时若未指定则交互选择
export MODE="${MODE:-}"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BACKEND_DIR="$SCRIPT_DIR/backend"
FRONTEND_DIR="$SCRIPT_DIR/frontend"
# nginx 配置与证书目录（默认 /opt/service/nginx/conf.d，可通过环境变量覆盖）
NGINX_CONF_DIR="${NGINX_CONF_DIR:-/opt/service/nginx/conf.d}"
NGINX_CERT_DIR="${NGINX_CERT_DIR:-/opt/service/nginx/ssl}"
NGINX_CONF="$NGINX_CONF_DIR/mengya_ssl.conf"
PID_DIR="$SCRIPT_DIR/.run"
BACKEND_PID_FILE="$PID_DIR/backend.pid"
FRONTEND_PID_FILE="$PID_DIR/frontend.pid"
LOG_DIR="$SCRIPT_DIR/logs"
MODE_FILE="$SCRIPT_DIR/.run_mode"

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

# 探测可用的 python 命令（优先 python3，兼容 python）
detect_python() {
    if command -v python3 >/dev/null 2>&1; then
        echo "python3"
    elif command -v python >/dev/null 2>&1; then
        echo "python"
    else
        echo ""
    fi
}

# 校验 MODE 取值
validate_mode() {
    case "$MODE" in
        docker|local) return 0 ;;
        *)
            echo "  [错误] MODE 取值无效: '$MODE'（仅支持 docker / local）"
            echo "         示例: MODE=docker ./run.sh start  或  MODE=local ./run.sh start"
            exit 1
            ;;
    esac
}

# 读取上次使用的启动方式
get_last_mode() {
    local m=""
    if [ -f "$MODE_FILE" ]; then
        m=$(cat "$MODE_FILE" 2>/dev/null | tr -d '[:space:]' || true)
    fi
    case "$m" in
        docker|local) echo "$m" ;;
        *) echo "" ;;
    esac
}

# 选择启动方式：优先 MODE 环境变量 → 上次选择 → 交互选择
choose_mode() {
    if [ -n "$MODE" ]; then
        validate_mode
        return 0
    fi

    local last
    last=$(get_last_mode)
    if [ -n "$last" ]; then
        echo ""
        read -r -p "  检测到上次使用 [$last] 方式启动，是否继续？[Y/n]: " ans
        case "$ans" in
            ""|y|Y|yes|YES)
                export MODE="$last"
                return 0
                ;;
            *)
                echo "  请重新选择启动方式。"
                ;;
        esac
    fi

    echo ""
    echo "============================================"
    echo "  请选择启动方式："
    echo "    1) docker  - Docker Compose（推荐，适合服务器/容器部署）"
    echo "    2) local   - 传统方式（本机 python3 + Vite，适合本地开发）"
    echo "============================================"
    while true; do
        read -r -p "  请输入序号 [1/2]: " choice
        case "$choice" in
            1)
                export MODE="docker"
                return 0
                ;;
            2)
                export MODE="local"
                return 0
                ;;
            *)
                echo "  无效输入，请输入 1 或 2"
                ;;
        esac
    done
}

save_mode() {
    mkdir -p "$SCRIPT_DIR"
    echo "$MODE" > "$MODE_FILE"
}

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
    echo "  请确认 nginx 主配置已 include 该目录（一般默认包含），例如:"
    echo "      include $NGINX_CONF_DIR/*.conf;"
    echo "  然后执行测试与重载:"
    echo "    nginx -t && nginx -s reload"
    echo ""
    echo "  或使用 Docker 直接运行该配置:"
    echo "    docker run -d -p $EXTERNAL_PORT:$EXTERNAL_PORT \\"
    echo "      -v $NGINX_CONF:/etc/nginx/conf.d/default.conf \\"
    echo "      -v $NGINX_CERT_DIR:/etc/nginx/ssl nginx:alpine"
}

# ===== Docker Compose 方式 =====
compose_cmd() {
    if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
        echo "docker compose"
    elif command -v docker-compose >/dev/null 2>&1; then
        echo "docker-compose"
    else
        echo ""
    fi
}

start_docker() {
    local compose
    compose=$(compose_cmd)
    if [ -z "$compose" ]; then
        echo "  [错误] 未找到 docker compose，请先安装 Docker，或使用 MODE=local 传统方式启动"
        return 1
    fi

    echo "==> 启动全部服务（docker compose 方式）"
    cd "$SCRIPT_DIR"
    $compose up -d --build
    echo ""
    echo "  服务已启动，查看状态: $compose ps"
    echo "  查看日志: $compose logs -f"
}

stop_docker() {
    local compose
    compose=$(compose_cmd)
    if [ -z "$compose" ]; then
        echo "  [错误] 未找到 docker compose，请检查 docker 已安装"
        return 1
    fi
    echo "==> 停止全部服务（docker compose 方式）"
    cd "$SCRIPT_DIR"
    $compose down
}

restart_docker() {
    local compose
    compose=$(compose_cmd)
    if [ -z "$compose" ]; then
        echo "  [错误] 未找到 docker compose，请检查 docker 已安装"
        return 1
    fi
    echo "==> 重启全部服务（docker compose 方式）"
    cd "$SCRIPT_DIR"
    $compose up -d --build --force-recreate
}

status_docker() {
    local compose
    compose=$(compose_cmd)
    if [ -z "$compose" ]; then
        echo "  [提示] 未找到 docker compose，无法查看容器状态"
        return 1
    fi
    echo "==> docker compose 服务状态"
    cd "$SCRIPT_DIR"
    $compose ps
}

# ===== 传统方式：检查并安装后端依赖 =====
ensure_backend_deps() {
    local PY_CMD="$1"
    echo "  ==> 检查后端 Python 依赖..."

    # 1. 确保虚拟环境存在
    if [ ! -d "$BACKEND_DIR/.venv" ] && [ ! -d "$BACKEND_DIR/venv" ]; then
        echo "  [依赖] 未找到虚拟环境，创建 .venv（使用 $PY_CMD）..."
        (cd "$BACKEND_DIR" && "$PY_CMD" -m venv .venv)
    fi

    # 2. 确定 venv 中的 python
    local VENV_PY=""
    if [ -d "$BACKEND_DIR/.venv/bin" ]; then
        VENV_PY="$BACKEND_DIR/.venv/bin/python"
    elif [ -d "$BACKEND_DIR/venv/bin" ]; then
        VENV_PY="$BACKEND_DIR/venv/bin/python"
    fi
    [ -z "$VENV_PY" ] && VENV_PY="$PY_CMD"

    # 3. 校验依赖：pip check + 关键模块导入
    local need_install=0
    if ! "$VENV_PY" -m pip check >/dev/null 2>&1; then
        echo "  [依赖] pip check 未通过，将重新安装 requirements.txt..."
        need_install=1
    fi
    local missing=""
    for mod in django rest_framework dotenv; do
        if ! "$VENV_PY" -c "import $mod" >/dev/null 2>&1; then
            missing="$missing $mod"
        fi
    done
    if [ -n "$missing" ]; then
        echo "  [依赖] 检测到缺失模块:$missing，将安装 requirements.txt..."
        need_install=1
    fi

    if [ "$need_install" = "1" ]; then
        (cd "$BACKEND_DIR" && "$VENV_PY" -m pip install -r requirements.txt)
    else
        echo "  [依赖] 后端依赖完整，无需安装。"
    fi

    echo "$VENV_PY"
}

# ===== 传统方式：启动后端 =====
start_backend() {
    echo "==> 启动后端服务（端口 $BACKEND_PORT，传统方式）"
    if port_in_use "$BACKEND_PORT"; then
        echo "  [提示] 端口 $BACKEND_PORT 已被占用，跳过后端启动"
        echo "         请确认占用进程是否为旧实例，必要时先执行 ./run.sh stop"
        return 1
    fi

    local PY_CMD
    PY_CMD=$(detect_python)
    if [ -z "$PY_CMD" ]; then
        echo "  [错误] 未找到 python3 或 python，请先安装 Python 3"
        return 1
    fi

    local PYTHON
    PYTHON=$(ensure_backend_deps "$PY_CMD")

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

# ===== 传统方式：检查并安装前端依赖 =====
ensure_frontend_deps() {
    echo "  ==> 检查前端依赖..."
    cd "$FRONTEND_DIR"
    if [ ! -d "node_modules" ]; then
        echo "  [依赖] 未找到 node_modules，执行 npm install..."
        npm install
    else
        echo "  [依赖] 校验前端依赖完整性..."
        npm ls --depth=0 >/dev/null 2>&1 || {
            echo "  [依赖] 依赖不完整或缺失，执行 npm install..."
            npm install
        }
    fi
}

# ===== 传统方式：启动前端 =====
start_frontend() {
    echo "==> 启动前端服务（端口 $FRONTEND_PORT，传统方式）"
    if port_in_use "$FRONTEND_PORT"; then
        echo "  [提示] 端口 $FRONTEND_PORT 已被占用，跳过前端启动"
        echo "         请确认占用进程是否存在，必要时请执行 ./run.sh stop"
        return 1
    fi

    ensure_frontend_deps

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

# ===== 传统方式：停止全部 =====
stop_local_all() {
    echo "==> 停止服务（传统方式）"
    stop_service "$(get_backend_pid)" "后端 Django" "$BACKEND_PID_FILE"
    stop_service "$(get_frontend_pid)" "前端 Vite" "$FRONTEND_PID_FILE"
    echo "  服务已停止"
}

# ===== 传统方式：状态查询 =====
show_status_local() {
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
CMD="${1:-}"
case "$CMD" in
    "")
        # 无参数执行：只显示用法提示，退出，不启动任何服务
        echo ""
        echo "============================================"
        echo "  萌芽（mengya）平台服务管理脚本"
        echo "============================================"
        echo "  未指定子命令，请输入以下命令执行："
        echo "    ./run.sh start      启动服务（交互式选择启动方式）"
        echo "    ./run.sh stop       停止服务"
        echo "    ./run.sh restart    重启服务"
        echo "    ./run.sh status     查看状态"
        echo "    ./run.sh add_nginx  生成 nginx SSL 配置"
        echo "    ./run.sh help       查看帮助"
        echo "  启动方式：MODE=docker|local 指定，或交互式选择"
        echo "============================================"
        echo ""
        exit 0
        ;;
    start)
        choose_mode
        validate_mode
        save_mode
        if [ "$MODE" = "docker" ]; then
            start_docker
        else
            start_backend
            start_frontend
            show_status_local
            echo "============================================"
            echo "  启动完成！"
            echo "  内部访问: http://localhost:$BACKEND_PORT (后端) / http://localhost:$FRONTEND_PORT (前端)"
            echo "  管理员账号: $ADMIN_USERNAME / $ADMIN_PASSWORD"
            echo "============================================"
        fi
        ;;
    stop)
        last=$(get_last_mode)
        if [ "$last" = "docker" ]; then
            stop_docker
        else
            stop_local_all
        fi
        ;;
    restart)
        choose_mode
        validate_mode
        save_mode
        if [ "$MODE" = "docker" ]; then
            restart_docker
        else
            stop_local_all
            echo ""
            echo "==> 重新启动..."
            sleep 1
            start_backend
            start_frontend
            show_status_local
            echo "============================================"
            echo "  重启完成！"
            echo "  内部访问: http://localhost:$BACKEND_PORT / http://localhost:$FRONTEND_PORT"
            echo "  管理员账号: $ADMIN_USERNAME / $ADMIN_PASSWORD"
            echo "============================================"
        fi
        ;;
    status)
        last=$(get_last_mode)
        if [ "$last" = "docker" ]; then
            status_docker
        else
            show_status_local
        fi
        ;;
    add_nginx)
        gen_nginx_config
        ;;
    -h|--help|help)
        sed -n '1,35p' "$0" | sed 's/^# \{0,1\}//'
        ;;
    *)
        echo "未知命令: $CMD"
        echo "用法: ./run.sh [start|stop|restart|status|add_nginx|help]"
        echo "      启动前可指定 MODE=docker|local 跳过交互选择"
        exit 1
        ;;
esac