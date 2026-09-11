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
#   ADMIN_USERNAME    管理员账号（手机号或用户名，默认 admin）
#   ADMIN_PASSWORD    管理员密码（默认 admin123）
#   ADMIN_NICKNAME    管理员昵称（默认 管理员）
#   BACKEND_PORT      后端服务端口（默认 8000）
#   FRONTEND_PORT     前端服务端口（默认 5173）
#   EXTERNAL_PORT     外部访问端口（默认 10224，nginx SSL 反代）
#   DB_IMAGE          数据库镜像（默认 pgvector/pgvector:pg18；本地已有则直接复用）
#   ENABLE_WORKER     是否启用 redis/worker（auto=自动检测 Celery 任务，1=强制启用，0=禁用，默认 auto）
#   ENABLE_NGINX      是否启用 nginx 容器（1=启用，默认 0）
#
# Docker 镜像策略：
#   - 启动前自动检测本地已有镜像，存在则直接复用，不存在才拉取
#   - 数据库镜像优先级：DB_IMAGE 环境变量 > 本地已有 pgvector/pgvector:pg18 > postgres:15-alpine > 默认 pgvector
#   - redis/worker 默认不启动（无 Celery 任务时），检测到任务或 ENABLE_WORKER=1 才启动
#   - nginx 默认不启动，ENABLE_NGINX=1 启用
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
export ADMIN_USERNAME="${ADMIN_USERNAME:-admin}"
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
    local pids
    pids=$(get_port_pids "$port")
    if [ -n "$pids" ]; then
        return 0
    fi
    if command -v ss >/dev/null 2>&1; then
        ss -ltn 2>/dev/null | grep -qE "[:.]$port[[:space:]]" && return 0
    fi
    if command -v lsof >/dev/null 2>&1; then
        lsof -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1 && return 0
    fi
    return 1
}

# 获取占用指定 TCP 端口的 PID 列表
get_port_pids() {
    local port="$1"
    local pids=""
    if command -v lsof >/dev/null 2>&1; then
        pids=$(lsof -t -iTCP:"$port" -sTCP:LISTEN 2>/dev/null || true)
    fi
    if [ -z "$pids" ] && command -v fuser >/dev/null 2>&1; then
        pids=$(fuser "$port/tcp" 2>/dev/null || true)
    fi
    if [ -z "$pids" ] && command -v ss >/dev/null 2>&1; then
        pids=$(ss -lptn "sport = :$port" 2>/dev/null | grep -oP 'pid=\K[0-9]+' | sort -u || true)
    fi
    if [ -z "$pids" ] && command -v netstat >/dev/null 2>&1; then
        pids=$(netstat -tlpn 2>/dev/null | grep ":$port " | awk '{print $7}' | cut -d/ -f1 | grep -oE '[0-9]+' | sort -u || true)
    fi
    echo "$pids"
}

# 获取指定 PID 的所有子代与后代 PID
get_descendant_pids() {
    local parent="$1"
    local children=""
    if command -v pgrep >/dev/null 2>&1; then
        children=$(pgrep -P "$parent" 2>/dev/null || true)
    elif [ -d /proc ]; then
        children=$(awk -v p="$parent" '$4 == p {print $1}' /proc/[0-9]*/stat 2>/dev/null | sort -u || true)
    fi
    for child in $children; do
        get_descendant_pids "$child"
        echo "$child"
    done
}

# 停止指定 PID 及其所有子进程（自底向上收集并终止，杜绝孤儿进程残留）
kill_pid_tree() {
    local pid="$1"
    [ -z "$pid" ] && return 0
    local all_pids
    all_pids="$(get_descendant_pids "$pid") $pid"
    for p in $all_pids; do
        kill "$p" 2>/dev/null || true
    done
    for _ in $(seq 1 6); do
        local any_alive=0
        for p in $all_pids; do
            if kill -0 "$p" 2>/dev/null; then
                any_alive=1
                break
            fi
        done
        [ "$any_alive" = "0" ] && break
        sleep 0.5
    done
    for p in $all_pids; do
        if kill -0 "$p" 2>/dev/null; then
            kill -9 "$p" 2>/dev/null || true
        fi
    done
}

pid_alive() {
    local pid="$1"
    [ -z "$pid" ] && return 1
    kill -0 "$pid" 2>/dev/null
}

read_pid() {
    local pidfile="$1"
    local pid=""
    if [ -f "$pidfile" ]; then
        pid=$(cat "$pidfile" 2>/dev/null | tr -d '[:space:]' || true)
    fi
    if [ -n "$pid" ] && pid_alive "$pid"; then
        echo "$pid"
    else
        echo ""
    fi
}

get_backend_pid() { read_pid "$BACKEND_PID_FILE"; }
get_frontend_pid() { read_pid "$FRONTEND_PID_FILE"; }
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

# ===== 镜像检测与可选服务控制 =====

# 检测本地是否已存在指定镜像（精确匹配仓库:标签）
image_exists() {
    local img="$1"
    [ -z "$img" ] && return 1
    docker image inspect "$img" >/dev/null 2>&1
}

# 智能选择数据库镜像：
#   1. DB_IMAGE 环境变量强制指定
#   2. 本地已存在 pgvector/pgvector:pg18 → 直接复用（不拉取）
#   3. 本地已存在 postgres:15-alpine → 复用旧镜像（兼容旧数据卷）
#   4. 均不存在 → 使用默认 pgvector/pgvector:pg18（启动时由 compose 拉取）
choose_db_image() {
    local img
    if [ -n "${DB_IMAGE:-}" ]; then
        echo "$DB_IMAGE"
        return 0
    fi
    for img in pgvector/pgvector:pg18 postgres:15-alpine; do
        if image_exists "$img"; then
            echo "$img"
            return 0
        fi
    done
    echo "pgvector/pgvector:pg18"
}

# 检测后端是否存在 Celery 异步任务（tasks.py 或 @shared_task/@app.task 定义）
has_celery_tasks() {
    grep -rqE "@(shared_task|app\.task)|\.delay\(|apply_async" "$BACKEND_DIR" --include="*.py" 2>/dev/null
}

# 检测当前 docker compose 是否支持 --profile 选项
compose_supports_profiles() {
    local compose="$1"
    [ -z "$compose" ] && return 1
    $compose --help 2>&1 | grep -q -- "--profile"
}

# 组装 docker compose 附加参数（profiles + 环境变量）
#   - redis/worker：检测到 Celery 任务则附加 celery profile；ENABLE_WORKER=1/0 可强制
#   - nginx：       ENABLE_NGINX=1 时附加 nginx profile
# 注意：提示信息输出到 stderr，仅将 --profile 参数输出到 stdout（供命令替换捕获）
compose_extra_args() {
    local compose
    compose=$(compose_cmd)
    if [ -n "$compose" ] && ! compose_supports_profiles "$compose"; then
        echo "  [Docker] 当前 docker compose 版本不支持 --profile，跳过 profile 参数" >&2
        return 0
    fi

    local args=""
    local enable_worker="${ENABLE_WORKER:-auto}"

    if [ "$enable_worker" = "1" ]; then
        args="$args --profile celery"
        echo "  [Docker] ENABLE_WORKER=1 已强制启用 redis/worker（celery profile）" >&2
    elif [ "$enable_worker" = "0" ]; then
        echo "  [Docker] ENABLE_WORKER=0 已禁用 redis/worker（celery profile）" >&2
    elif has_celery_tasks; then
        args="$args --profile celery"
        echo "  [Docker] 检测到后端 Celery 任务，启用 redis/worker（celery profile）" >&2
    else
        echo "  [Docker] 未检测到 Celery 任务，跳过 redis/worker" >&2
    fi

    if [ "${ENABLE_NGINX:-0}" = "1" ]; then
        args="$args --profile nginx"
        echo "  [Docker] ENABLE_NGINX=1 已启用 nginx（nginx profile）" >&2
    else
        echo "  [Docker] ENABLE_NGINX 未开启，跳过 nginx" >&2
    fi

    echo "$args"
}

# 输出本次启动将启用的服务清单（供用户确认）
compose_summary() {
    local img db_image
    img=$(choose_db_image)
    echo "  [Docker] 数据库镜像: $img"
    if image_exists "$img"; then
        echo "  [Docker] 镜像已存在本地，直接复用，无需拉取"
    else
        echo "  [Docker] 镜像不存在本地，启动时将自动拉取: $img"
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
    compose_summary

    local args
    args=$(compose_extra_args)

    cd "$SCRIPT_DIR"
    # 注意：--profile 是 docker compose 全局参数，必须放在子命令（up）之前
    DB_IMAGE="$(choose_db_image)" $compose $args up -d --build
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
    local args
    args=$(compose_extra_args 2>/dev/null || true)
    # 注意：停止服务时附加 --remove-orphans 彻底清理，全局参数置于 down 之前
    $compose $args down --remove-orphans
}

restart_docker() {
    local compose
    compose=$(compose_cmd)
    if [ -z "$compose" ]; then
        echo "  [错误] 未找到 docker compose，请检查 docker 已安装"
        return 1
    fi
    echo "==> 重启全部服务（docker compose 方式）"
    compose_summary
    local args
    args=$(compose_extra_args)
    cd "$SCRIPT_DIR"
    # 注意：--profile 是 docker compose 全局参数，必须放在子命令（up）之前
    DB_IMAGE="$(choose_db_image)" $compose $args up -d --build --force-recreate
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
    # 注意：docker compose ps 用于列出容器状态，无需且不可附带 --profile 标志
    $compose ps
}

# ===== 传统方式：检查并安装后端依赖 =====
ensure_backend_deps() {
    local PY_CMD="$1"
    echo "  ==> 检查后端 Python 依赖..." >&2

    # 1. 确保虚拟环境存在
    if [ ! -d "$BACKEND_DIR/.venv" ] && [ ! -d "$BACKEND_DIR/venv" ]; then
        echo "  [提示] 未找到虚拟环境，正在创建 .venv（使用 $PY_CMD）..." >&2
        (cd "$BACKEND_DIR" && "$PY_CMD" -m venv .venv >&2)
    fi

    # 2. 确定 venv 中的 python（兼容 Linux/Mac 与 Windows/Git Bash）
    local VENV_PY=""
    if [ -d "$BACKEND_DIR/.venv/bin" ]; then
        VENV_PY="$BACKEND_DIR/.venv/bin/python"
    elif [ -d "$BACKEND_DIR/venv/bin" ]; then
        VENV_PY="$BACKEND_DIR/venv/bin/python"
    elif [ -f "$BACKEND_DIR/.venv/Scripts/python" ]; then
        VENV_PY="$BACKEND_DIR/.venv/Scripts/python"
    elif [ -f "$BACKEND_DIR/.venv/Scripts/python.exe" ]; then
        VENV_PY="$BACKEND_DIR/.venv/Scripts/python.exe"
    elif [ -f "$BACKEND_DIR/venv/Scripts/python.exe" ]; then
        VENV_PY="$BACKEND_DIR/venv/Scripts/python.exe"
    fi
    [ -z "$VENV_PY" ] && VENV_PY="$PY_CMD"

    # 3. 校验依赖（pip check + 关键模块导入）
    local need_install=0
    if ! "$VENV_PY" -m pip check >/dev/null 2>&1; then
        echo "  [提示] pip check 未通过，尝试重新安装 requirements.txt..." >&2
        need_install=1
    fi
    local missing=""
    for mod in django rest_framework dotenv; do
        if ! "$VENV_PY" -c "import $mod" >/dev/null 2>&1; then
            missing="$missing $mod"
        fi
    done
    if [ -n "$missing" ]; then
        echo "  [提示] 检测到缺失模块:$missing，正在安装 requirements.txt..." >&2
        need_install=1
    fi

    if [ "$need_install" = "1" ]; then
        (cd "$BACKEND_DIR" && "$VENV_PY" -m pip install -r requirements.txt >&2)
    else
        echo "  [提示] 后端依赖校验通过，无需重新安装。" >&2
    fi

    echo "$VENV_PY"
}

# ===== 传统方式：启动后端 =====
start_backend() {
    echo "==> 启动后端服务（端口 $BACKEND_PORT，传统方式）"
    if port_in_use "$BACKEND_PORT"; then
        echo "  [提示] 端口 $BACKEND_PORT 已被占用，跳过后端启动"
        echo "         请确认占用进程是否为本实例，必要时先执行 ./run.sh stop"
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

    cd "$BACKEND_DIR"
    mkdir -p "$LOG_DIR" "$PID_DIR"

    echo "  执行数据库迁移..."
    "$PYTHON" manage.py migrate --noinput
    echo "  初始化种子数据..."
    "$PYTHON" manage.py init_data --skip-if-exists
    "$PYTHON" manage.py init_fetal_stories --skip-if-exists
    "$PYTHON" manage.py ensure_admin

    # 绑定 127.0.0.1 回环地址，仅供本机前端代理转发访问，不对公网开放 8000 端口
    nohup "$PYTHON" manage.py runserver 127.0.0.1:$BACKEND_PORT \
        >> "$LOG_DIR/backend.log" 2>&1 &
    echo $! > "$BACKEND_PID_FILE"
    echo "  后端 PID: $(cat "$BACKEND_PID_FILE")"
    echo "  日志: $LOG_DIR/backend.log"
    cd "$SCRIPT_DIR"
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

    cd "$FRONTEND_DIR"
    mkdir -p "$LOG_DIR" "$PID_DIR"
    local VITE_BIN="./node_modules/.bin/vite"
    if [ -f "$VITE_BIN" ]; then
        nohup "$VITE_BIN" --port "$FRONTEND_PORT" --host 0.0.0.0 \
            >> "$LOG_DIR/frontend.log" 2>&1 &
    else
        nohup npm run dev -- --port "$FRONTEND_PORT" --host 0.0.0.0 \
            >> "$LOG_DIR/frontend.log" 2>&1 &
    fi
    echo $! > "$FRONTEND_PID_FILE"
    echo "  前端 PID: $(cat "$FRONTEND_PID_FILE")"
    echo "  日志: $LOG_DIR/frontend.log"
    cd "$SCRIPT_DIR"
}

# ===== 停止单个服务 =====
stop_service() {
    local pid="$1"
    local name="$2"
    local pidfile="$3"
    local port="$4"
    local pattern="$5"
    local stopped=0
    local target_pids=""

    # 维度 1：PID 文件中的 PID
    if [ -n "$pid" ] && pid_alive "$pid"; then
        target_pids="$target_pids $pid"
    fi

    # 维度 2：监听端口的 PID
    if [ -n "$port" ]; then
        local port_pids
        port_pids=$(get_port_pids "$port")
        if [ -n "$port_pids" ]; then
            target_pids="$target_pids $port_pids"
        fi
    fi

    # 维度 3：按命令行模式匹配的 PID
    if [ -n "$pattern" ] && command -v pgrep >/dev/null 2>&1; then
        local pattern_pids
        pattern_pids=$(pgrep -f "$pattern" 2>/dev/null || true)
        if [ -n "$pattern_pids" ]; then
            target_pids="$target_pids $pattern_pids"
        fi
    fi

    # 去重
    local unique_pids
    unique_pids=$(echo "$target_pids" | tr " " "\n" | grep -E "^[0-9]+$" | sort -u || true)

    if [ -n "$unique_pids" ]; then
        echo "  ==> 停止 $name (相关 PID: $unique_pids)"
        for p in $unique_pids; do
            kill_pid_tree "$p"
        done
        stopped=1
    fi
    rm -f "$pidfile"

    # 校验并等待端口释放
    if [ -n "$port" ]; then
        for _ in $(seq 1 6); do
            local remaining_pids
            remaining_pids=$(get_port_pids "$port")
            if [ -z "$remaining_pids" ]; then
                break
            fi
            for rp in $remaining_pids; do
                kill -9 "$rp" 2>/dev/null || true
            done
            sleep 0.5
        done
    fi

    if [ "$stopped" = "1" ]; then
        echo "  $name 已成功停止"
    else
        echo "  $name 未在运行（无有效 PID 或端口监听）"
    fi
}

# ===== 传统方式：停止全部 =====
stop_local_all() {
    echo "==> 停止服务（传统方式）"
    stop_service "$(get_backend_pid)" "后端 Django" "$BACKEND_PID_FILE" "$BACKEND_PORT" "manage.py runserver"
    stop_service "$(get_frontend_pid)" "前端 Vite" "$FRONTEND_PID_FILE" "$FRONTEND_PORT" "vite"
    echo "  传统服务停止操作完成"
}
# ===== 传统方式：状态查询 =====
show_status_local() {
    echo "============================================"
    echo "  萌芽（mengya）平台"
    echo "============================================"
    local bp fp
    bp=$(get_backend_pid)
    fp=$(get_frontend_pid)

    echo "  后端 Django  : $([ -n "$bp" ] && echo "运行中 (PID $bp, 端口 $BACKEND_PORT)" || (port_in_use "$BACKEND_PORT" && echo "端口已占用 (外部进程)" || echo "未运行"))"
    echo "  前端 Vite    : $([ -n "$fp" ] && echo "运行中 (PID $fp, 端口 $FRONTEND_PORT)" || (port_in_use "$FRONTEND_PORT" && echo "端口已占用 (外部进程)" || echo "未运行"))"
    echo "  nginx 配置   : $([ -f "$NGINX_CONF" ] && echo "已生成 ($NGINX_CONF)" || echo "未生成")"
    echo "  日志目录     : $LOG_DIR"
    echo ""

    local note=0
    if [ -z "$bp" ] && port_in_use "$BACKEND_PORT"; then
        echo "  [提示] 端口 $BACKEND_PORT 有进程监听，但 PID 文件不匹配（可用 ./run.sh stop 清理）"
        note=1
    fi
    if [ -z "$fp" ] && port_in_use "$FRONTEND_PORT"; then
        echo "  [提示] 端口 $FRONTEND_PORT 有进程监听，但 PID 文件不匹配（可用 ./run.sh stop 清理）"
        note=1
    fi
    [ "$note" = "1" ] && echo "         如为残留进程，执行 ./run.sh stop 将自动清理。"
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
            echo "  访问地址: http://localhost:$FRONTEND_PORT (前端页面，内置反代至后端接口)"
            echo "  后端服务: 仅监听 127.0.0.1:$BACKEND_PORT (不对外暴露，保护系统安全)"
            echo "  管理员账号: $ADMIN_USERNAME / $ADMIN_PASSWORD"
            echo "============================================"
        fi
        ;;
    stop)
        if [ "$MODE" = "docker" ]; then
            stop_docker
        elif [ "$MODE" = "local" ]; then
            stop_local_all
        else
            last=$(get_last_mode)
            if [ "$last" = "docker" ]; then
                stop_docker
            elif [ "$last" = "local" ]; then
                stop_local_all
            else
                stop_docker 2>/dev/null || true
                stop_local_all
            fi
        fi
        # 兜底清理：只要本地存在残留 PID 文件或本地端口被占用，自动执行传统服务彻底清理
        if [ -f "$BACKEND_PID_FILE" ] || [ -f "$FRONTEND_PID_FILE" ] || port_in_use "$BACKEND_PORT" || port_in_use "$FRONTEND_PORT"; then
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
            echo "  访问地址: http://localhost:$FRONTEND_PORT (前端页面，内置反代至后端接口)"
            echo "  后端服务: 仅监听 127.0.0.1:$BACKEND_PORT (不对外暴露，保护系统安全)"
            echo "  管理员账号: $ADMIN_USERNAME / $ADMIN_PASSWORD"
            echo "============================================"
        fi
        ;;
    status)
        target_mode="${MODE:-}"
        if [ -z "$target_mode" ]; then
            target_mode=$(get_last_mode)
        fi

        if [ "$target_mode" = "docker" ]; then
            status_docker
        elif [ "$target_mode" = "local" ]; then
            show_status_local
        else
            # 未明确指定且无记录时，智能判断
            local_compose=$(compose_cmd)
            if [ -f "$BACKEND_PID_FILE" ] || [ -f "$FRONTEND_PID_FILE" ] || port_in_use "$BACKEND_PORT" || port_in_use "$FRONTEND_PORT"; then
                show_status_local
            elif [ -n "$local_compose" ] && (cd "$SCRIPT_DIR" && $local_compose ps -q 2>/dev/null | grep -q .); then
                status_docker
            else
                show_status_local
            fi
        fi
        ;;
    add_nginx)
        gen_nginx_config
        ;;
    -h|--help|help)
        sed -n '1,50p' "$0" | sed 's/^# \{0,1\}//'
        ;;
    *)
        echo "未知命令: $CMD"
        echo "用法: ./run.sh [start|stop|restart|status|add_nginx|help]"
        echo "      启动前可指定 MODE=docker|local 跳过交互选择"
        exit 1
        ;;
esac

