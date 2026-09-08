#!/bin/bash
# ============================================================
# 萌芽（mengya）平台一键启动脚本
#
# 可自定义的配置项（通过环境变量传入，均有默认值）：
#   ADMIN_PHONE       管理员手机号（默认 13800000001）
#   ADMIN_PASSWORD    管理员密码（默认 admin123）
#   ADMIN_NICKNAME    管理员昵称（默认 管理员）
#   BACKEND_PORT      后端服务端口（默认 8000）
#   FRONTEND_PORT     前端服务端口（默认 5173）
#   EXTERNAL_PORT     外部访问端口（默认 10224，nginx SSL 反代）
#
# 用法示例：
#   1. 使用默认配置启动：
#      ./run.sh
#
#   2. 自定义管理员和端口：
#      ADMIN_PHONE=13900000000 ADMIN_PASSWORD=mypassword BACKEND_PORT=9000 ./run.sh
#
#   3. 自定义外部访问端口：
#      EXTERNAL_PORT=20448 ./run.sh
# ============================================================

set -e

# ===== 配置项（可从环境变量覆盖）=====
export ADMIN_PHONE="${ADMIN_PHONE:-13800000001}"
export ADMIN_PASSWORD="${ADMIN_PASSWORD:-admin123}"
export ADMIN_NICKNAME="${ADMIN_NICKNAME:-管理员}"
export BACKEND_PORT="${BACKEND_PORT:-8000}"
export FRONTEND_PORT="${FRONTEND_PORT:-5173}"
export EXTERNAL_PORT="${EXTERNAL_PORT:-10224}"

# ===== 内部配置（一般无需修改）=====
export DJANGO_SECRET_KEY="${DJANGO_SECRET_KEY:-dev-only-change-this-in-production}"
export DJANGO_DEBUG="${DJANGO_DEBUG:-True}"
export DJANGO_ALLOWED_HOSTS="${DJANGO_ALLOWED_HOSTS:-localhost,127.0.0.1,0.0.0.0}"
export CORS_ALLOWED_ORIGINS="${CORS_ALLOWED_ORIGINS:-http://localhost:${FRONTEND_PORT},http://127.0.0.1:${FRONTEND_PORT}}"

echo "============================================"
echo "  萌芽（mengya）平台启动"
echo "============================================"
echo "  管理员手机号：$ADMIN_PHONE"
echo "  管理员昵称：  $ADMIN_NICKNAME"
echo "  后端端口：    $BACKEND_PORT"
echo "  前端端口：    $FRONTEND_PORT"
echo "  外部SSL端口： $EXTERNAL_PORT"
echo "============================================"
echo ""

# ===== 检查 Python 环境 =====
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BACKEND_DIR="$SCRIPT_DIR/backend"
FRONTEND_DIR="$SCRIPT_DIR/frontend"

if ! command -v python &> /dev/null; then
    echo "[错误] 未找到 Python，请先安装 Python 3.10+"
    exit 1
fi

# ===== 启动后端 =====
echo "[1/3] 启动后端 Django 服务（端口 $BACKEND_PORT）..."

cd "$BACKEND_DIR"

# 安装依赖（如果需要）
if [ ! -d "venv" ] && [ -z "$SKIP_VENV" ]; then
    echo "  创建虚拟环境..."
    python -m venv venv
    source venv/bin/activate
    pip install -r requirements.txt
else
    if [ -f "venv/bin/activate" ]; then
        source venv/bin/activate
    fi
fi

# 数据库迁移
echo "  执行数据库迁移..."
python manage.py migrate --noinput 2>/dev/null || true

# 初始化种子数据
python manage.py init_data --skip-if-exists 2>/dev/null || true

# 初始化胎教故事数据
python manage.py init_fetal_stories --skip-if-exists 2>/dev/null || true

# 创建/更新管理员账号（支持环境变量自定义）
echo "  创建管理员账号：$ADMIN_PHONE"
python manage.py ensure_admin 2>/dev/null || true


# 启动 Django
echo "  启动 Django 开发服务器..."
python manage.py runserver 0.0.0.0:$BACKEND_PORT &
BACKEND_PID=$!
echo "  后端 PID: $BACKEND_PID"

# ===== 启动前端 =====
echo ""
echo "[2/3] 启动前端 Vite 服务（端口 $FRONTEND_PORT）..."

cd "$FRONTEND_DIR"

# 安装依赖（如果需要）
if [ ! -d "node_modules" ]; then
    echo "  安装前端依赖..."
    npm install
fi

# 启动 Vite
echo "  启动 Vite 开发服务器..."
npm run dev -- --host 0.0.0.0 --port $FRONTEND_PORT &
FRONTEND_PID=$!
echo "  前端 PID: $FRONTEND_PID"

# ===== 启动 nginx SSL 反代 =====
echo ""
echo "[3/3] 配置 nginx SSL 反代（外部端口 $EXTERNAL_PORT）..."

NGINX_CONF="$SCRIPT_DIR/nginx/mengya_ssl.conf"
NGINX_CERT_DIR="$SCRIPT_DIR/nginx/ssl"

# 生成自签名证书（如果不存在）
if [ ! -f "$NGINX_CERT_DIR/mengya.crt" ]; then
    echo "  生成自签名 SSL 证书..."
    mkdir -p "$NGINX_CERT_DIR"
    openssl req -x509 -newkey rsa:2048 -keyout "$NGINX_CERT_DIR/mengya.key" \
        -out "$NGINX_CERT_DIR/mengya.crt" -days 365 -nodes \
        -subj "/C=CN/O=mengya/CN=localhost" 2>/dev/null || true
fi

# 生成 nginx 配置
cat > "$NGINX_CONF" << EOF
server {
    listen $EXTERNAL_PORT ssl;
    server_name localhost;

    ssl_certificate     $NGINX_CERT_DIR/mengya.crt;
    ssl_certificate_key $NGINX_CERT_DIR/mengya.key;
    ssl_protocols       TLSv1.2 TLSv1.3;
    ssl_ciphers         HIGH:!aNULL:!MD5;

    # 前端
    location / {
        proxy_pass http://127.0.0.1:$FRONTEND_PORT;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
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
echo "============================================"
echo "  启动完成！"
echo "  外部访问地址: https://localhost:$EXTERNAL_PORT"
echo "  管理员账号:   $ADMIN_PHONE"
echo "  管理员密码:   $ADMIN_PASSWORD"
echo "============================================"

# 如果安装了 nginx，自动启动
if command -v nginx &> /dev/null; then
    echo "  启动 nginx..."
    nginx -c "$NGINX_CONF" 2>/dev/null || \
    echo "  请手动运行: nginx -c $NGINX_CONF"
else
    echo "  [提示] 未安装 nginx，请安装后运行:"
    echo "  nginx -c $NGINX_CONF"
    echo ""
    echo "  或使用 Docker 方式启动:"
    echo "  docker run -d -p $EXTERNAL_PORT:$EXTERNAL_PORT \\"
    echo "    -v $NGINX_CONF:/etc/nginx/conf.d/mengya_ssl.conf \\"
    echo "    -v $NGINX_CERT_DIR:/etc/nginx/ssl \\"
    echo "    nginx:alpine"
fi

echo ""
echo "按 Ctrl+C 停止所有服务..."

# 捕获退出信号
trap "echo '正在停止服务...'; kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; nginx -s stop 2>/dev/null; exit 0" INT TERM

# 等待子进程
wait
