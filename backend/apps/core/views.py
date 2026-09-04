"""API 视图：萌芽母婴平台全部接口"""
import csv
import io
import random
import re

from django.contrib.auth import get_user_model
from django.conf import settings
from django.db import models
from django.http import HttpResponse
from django.shortcuts import get_object_or_404
from rest_framework import status, viewsets
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated, IsAdminUser
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken

from .models import (
    AIQueryLog,
    AuditLog,
    BabyProfile,
    BrandProfile,
    HealthRecord,
    InviteLink,
    Notification,
    Product,
    ProductComparison,
    ShoppingList,
    ShoppingListItem,
    SystemSetting,
    TimelineEvent,
    UserFavorite,
)
from .serializers import (
    BabyProfileSerializer,
    BrandProfileSerializer,
    FavoriteSerializer,
    HealthRecordSerializer,
    NotificationSerializer,
    ProductSerializer,
    ShoppingListSerializer,
    TimelineSerializer,
    UserSerializer,
)
from .services import ai_service
from .services.product_comparator import ProductComparator
from .services.shopping_list_generator import ShoppingListGenerator
from .utils.rate_limit import rate_limit
from .utils.stage_utils import get_stage_info
from .utils.audit import audit

User = get_user_model()


# ============ 安全风控辅助 ============

def _get_client_ip(request):
    """获取客户端 IP（兼容反代）"""
    xff = request.META.get("HTTP_X_FORWARDED_FOR")
    if xff:
        return xff.split(",")[0].strip()
    return request.META.get("REMOTE_ADDR", "")


def _find_user_by_account(account):
    """按手机号或用户名查找用户"""
    if not account:
        return None
    return (
        User.objects.filter(phone=account).first()
        or User.objects.filter(username=account).first()
    )


def _security_setting():
    """获取当前安全风控阈值配置"""
    s = SystemSetting.get_settings()
    return {
        "captcha_threshold": max(1, s.login_captcha_threshold or 3),
        "freeze_threshold": max(2, s.login_freeze_threshold or 10),
        "lock_minutes": max(0, s.login_lock_minutes or 0),
    }


def _maybe_require_captcha(user, fail_count, threshold):
    """达到阈值时返回需要验证码的响应"""
    return Response(
        {
            "code": 1010,
            "message": f"连续失败次数过多，请输入验证码后继续",
            "data": {
                "need_captcha": True,
                "fail_count": fail_count,
                "threshold": threshold,
            },
        },
        status=status.HTTP_400_BAD_REQUEST,
    )


def _check_locked(user, sec):
    """检查用户是否处于临时锁定期，返回 (locked, remaining_seconds, response)"""
    if not user or not user.locked_until:
        return False, 0, None
    from django.utils import timezone
    now = timezone.now()
    if now < user.locked_until:
        remaining = int((user.locked_until - now).total_seconds())
        return True, remaining, Response(
            {
                "code": 1012,
                "message": f"账号已锁定，请 {remaining} 秒后再试",
                "data": {
                    "locked": True,
                    "wait_seconds": remaining,
                },
            },
            status=status.HTTP_403_FORBIDDEN,
        )
    # 锁定已过期，清除锁定状态
    user.locked_until = None
    user.login_fail_count = 0
    user.save(update_fields=["locked_until", "login_fail_count"])
    return False, 0, None


def _register_login_failure(user, fail_count, freeze_threshold, lock_minutes=5):
    """记录登录失败，达到冻结阈值后临时锁定一段时间"""
    if user:
        user.login_fail_count = fail_count
        if user.is_active and fail_count >= freeze_threshold:
            # 临时锁定：设置 locked_until
            from django.utils import timezone
            from datetime import timedelta
            lock_min = max(1, lock_minutes)
            user.locked_until = timezone.now() + timedelta(minutes=lock_min)
            user.save(update_fields=["locked_until", "login_fail_count"])
            return True
        user.save(update_fields=["login_fail_count"])
    return False


# ============ 认证 ============

@api_view(["POST"])
@permission_classes([AllowAny])
@rate_limit("login", 10)
def register(request):
    from .serializers import RegisterSerializer

    # 检查注册模式
    reg_mode = SystemSetting.get_registration_mode()
    invite_token = request.data.get("invite_token", "")

    invite = None
    if reg_mode == "invitation_only":
        if not invite_token:
            return Response(
                {"code": 3001, "message": "当前为邀请注册模式，请通过邀请链接注册", "data": None},
                status=status.HTTP_403_FORBIDDEN,
            )
        try:
            invite = InviteLink.objects.get(token=invite_token)
        except InviteLink.DoesNotExist:
            return Response(
                {"code": 3002, "message": "邀请链接无效", "data": None},
                status=status.HTTP_403_FORBIDDEN,
            )
        if not invite.is_valid:
            return Response(
                {"code": 3003, "message": "邀请链接已失效或已用完", "data": None},
                status=status.HTTP_403_FORBIDDEN,
            )

    serializer = RegisterSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    user = serializer.save()

    # 邀请注册：更新使用次数
    if invite:
        invite.used_count += 1
        invite.save(update_fields=["used_count"])
        if invite.used_count >= invite.max_uses:
            invite.is_active = False
            invite.save(update_fields=["is_active"])

    refresh = RefreshToken.for_user(user)
    audit(request, "register", "注册账号", "user", user.id, user.username or user.phone,
          f"注册新账号 {user.username}", user=user)
    return Response(
        {
            "code": 0,
            "message": "注册成功",
            "data": {
                "user": UserSerializer(user).data,
                "access": str(refresh.access_token),
                "refresh": str(refresh),
            },
        }
    )


@api_view(["GET"])
@permission_classes([AllowAny])
def registration_mode(request):
    """获取当前注册模式（公开接口，注册页面使用）"""
    mode = SystemSetting.get_registration_mode()
    return Response({"code": 0, "message": "success", "data": {"mode": mode}})


@api_view(["POST"])
@permission_classes([AllowAny])
@rate_limit("login", 5)
def login(request):
    account = request.data.get("phone", "")  # 前端字段名仍叫 phone，但支持用户名
    password = request.data.get("password", "")
    captcha = request.data.get("captcha", "")
    sec = _security_setting()

    # 支持手机号或用户名登录
    user = _find_user_by_account(account)
    if user and not user.is_active:
        return Response(
            {"code": 1002, "message": "该账号已被冻结，请联系管理员", "data": None},
            status=status.HTTP_403_FORBIDDEN,
        )

    # 检查临时锁定状态
    locked, wait_secs, lock_resp = _check_locked(user, sec)
    if locked:
        return lock_resp

    # 密码校验（无论账号是否存在都统一提示，避免账号枚举）
    password_ok = bool(user) and user.check_password(password)
    if not password_ok:
        if user is None:
            # 不存在的账号：直接提示，避免无谓计数
            return Response(
                {"code": 1001, "message": "账号或密码错误", "data": None},
                status=status.HTTP_401_UNAUTHORIZED,
            )
        # 已有账号：累计失败次数
        fail_count = user.login_fail_count + 1
        if fail_count >= sec["freeze_threshold"]:
            _register_login_failure(user, fail_count, sec["freeze_threshold"], sec["lock_minutes"])
            audit(request, "login_fail", "登录失败(触发锁定)", "用户", user.username,
                  user.nickname or user.username,
                  f"连续失败 {fail_count} 次，已达锁定阈值，锁定 {sec['lock_minutes']} 分钟",
                  user=user)
            # 锁定后返回等待信息
            from django.utils import timezone
            remaining = int((user.locked_until - timezone.now()).total_seconds())
            return Response(
                {
                    "code": 1012,
                    "message": f"账号已锁定，请 {remaining} 秒后再试",
                    "data": {"locked": True, "wait_seconds": remaining},
                },
                status=status.HTTP_403_FORBIDDEN,
            )
        if fail_count >= sec["captcha_threshold"]:
            user.login_fail_count = fail_count
            user.save(update_fields=["login_fail_count"])
            audit(request, "login_fail", "登录失败(触发风控)", "用户", user.username,
                  user.nickname or user.username, f"连续失败 {fail_count} 次，已达验证码阈值",
                  user=user)
            return _maybe_require_captcha(user, fail_count, sec["captcha_threshold"])
        user.login_fail_count = fail_count
        user.save(update_fields=["login_fail_count"])
        audit(request, "login_fail", "登录失败", "用户", user.username,
              user.nickname or user.username, f"密码错误（累计失败 {fail_count} 次）",
              user=user)
        return Response(
            {"code": 1001, "message": "账号或密码错误", "data": None},
            status=status.HTTP_401_UNAUTHORIZED,
        )

    # 密码正确后仍需验证码（若失败次数已达阈值）
    if user.login_fail_count >= sec["captcha_threshold"]:
        expected = request.session.get("login_captcha", "")
        if not captcha or captcha.lower() != str(expected).lower():
            return Response(
                {
                    "code": 1011,
                    "message": "验证码不正确，请重新输入",
                    "data": {"need_captcha": True, "fail_count": user.login_fail_count, "threshold": sec["captcha_threshold"]},
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

    # 登录成功：清零失败计数、清除锁定
    if user.login_fail_count or user.locked_until:
        user.login_fail_count = 0
        user.locked_until = None
        user.save(update_fields=["login_fail_count", "locked_until"])
    request.session.pop("login_captcha", None)

    refresh = RefreshToken.for_user(user)
    audit(request, "login", "登录成功", "用户", user.username,
          user.nickname or user.username, detail=f"账号：{user.username}", user=user)
    return Response(
        {
            "code": 0,
            "message": "登录成功",
            "data": {
                "user": UserSerializer(user).data,
                "access": str(refresh.access_token),
                "refresh": str(refresh),
            },
        }
    )


@api_view(["GET"])
@permission_classes([AllowAny])
def captcha_status(request):
    """查询当前账号是否需要验证码或已锁定（公开接口，登录页轮询）"""
    account = request.query_params.get("phone", "")
    user = _find_user_by_account(account)
    if not user:
        return Response({"code": 0, "message": "success", "data": {"need_captcha": False, "fail_count": 0, "locked": False, "wait_seconds": 0}})
    sec = _security_setting()
    # 检查锁定状态
    locked, wait_secs, _ = _check_locked(user, sec)
    return Response({
        "code": 0,
        "message": "success",
        "data": {
            "need_captcha": user.login_fail_count >= sec["captcha_threshold"] and not locked,
            "fail_count": user.login_fail_count,
            "threshold": sec["captcha_threshold"],
            "locked": locked,
            "wait_seconds": wait_secs,
        },
    })


@api_view(["GET"])
@permission_classes([AllowAny])
def captcha_new(request):
    """生成图形验证码（返回 base64 图片 + 会话存答案）"""
    try:
        from PIL import Image, ImageDraw, ImageFont
    except ImportError:
        # 无 PIL 时退化为纯数字文本验证码
        code = str(random.randint(1000, 9999))
        request.session["login_captcha"] = code
        return Response({"code": 0, "message": "success", "data": {"type": "text", "code": code}})

    import base64
    from io import BytesIO

    # 生成 4 位随机字符（排除易混淆字符）
    chars = "23456789ABCDEFGHJKMNPQRSTUVWXYZ"
    code = "".join(random.choice(chars) for _ in range(4))
    request.session["login_captcha"] = code

    width, height = 120, 44
    img = Image.new("RGB", (width, height), (249, 250, 251))
    draw = None
    try:
        from PIL import ImageDraw

        draw = ImageDraw.Draw(img)
        # 干扰线
        for _ in range(5):
            x1 = random.randint(0, width)
            y1 = random.randint(0, height)
            x2 = random.randint(0, width)
            y2 = random.randint(0, height)
            draw.line([(x1, y1), (x2, y2)], fill=(220, 230, 240), width=1)
        # 噪点
        for _ in range(40):
            draw.point((random.randint(0, width), random.randint(0, height)), fill=(180, 200, 215))
        # 字符
        try:
            font = ImageFont.truetype("arial.ttf", 26)
        except Exception:
            font = ImageFont.load_default()
        x = 14
        for ch in code:
            draw.text((x, 8), ch, font=font, fill=(60, 80, 110))
            x += 24
    except Exception:
        pass

    buf = BytesIO()
    img.save(buf, format="PNG")
    b64 = base64.b64encode(buf.getvalue()).decode()
    return Response({"code": 0, "message": "success", "data": {"type": "image", "image": f"data:image/png;base64,{b64}"}})


@api_view(["POST"])
@permission_classes([AllowAny])
def sms_send(request):
    """发送验证码（演示环境直接返回验证码）"""
    phone = request.data.get("phone", "")
    if not phone.isdigit() or len(phone) != 11:
        return Response(
            {"code": 2001, "message": "手机号格式不正确", "data": None},
            status=status.HTTP_400_BAD_REQUEST,
        )
    code = "".join([str(random.randint(0, 9)) for _ in range(6)])
    return Response({"code": 0, "message": "验证码已发送", "data": {"debug_code": code}})


# ============ 用户 ============

class MeView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        user = request.user
        stage = get_stage_info(user.due_date, user.baby_birthday)
        return Response(
            {
                "code": 0,
                "message": "success",
                "data": {
                    "user": UserSerializer(user).data,
                    "stage": stage,
                },
            }
        )

    def put(self, request):
        serializer = UserSerializer(request.user, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response({"code": 0, "message": "已更新", "data": UserSerializer(request.user).data})


class AIConfigView(APIView):
    """AI 助手配置：支持多配置列表管理
    仅管理员(is_staff)或被授权用户(ai_authorized)可访问。

    GET  返回: { ai_configs: [...], has_global_key, can_manage }
    PUT  接收: { ai_configs: [{name, api_key, base_url, model, enabled}, ...] }
           也兼容旧版单字段: { ai_api_key, ai_base_url, ai_model }
    """
    permission_classes = [IsAuthenticated]

    def _check_access(self, user):
        return user.is_staff or user.ai_authorized

    def get(self, request):
        if not self._check_access(request.user):
            return Response(
                {"code": 4031, "message": "无权限访问 AI 配置，请联系管理员", "data": None},
                status=status.HTTP_403_FORBIDDEN,
            )
        user = request.user
        ai_configs = user.ai_configs or []
        # 若多配置为空但旧版单配置有值，自动迁移
        if not ai_configs and (user.ai_api_key or user.ai_base_url or user.ai_model):
            ai_configs = [{
                "name": "默认配置",
                "api_key": user.ai_api_key or "",
                "base_url": user.ai_base_url or "",
                "model": user.ai_model or "",
                "enabled": True,
            }]
        return Response({
            "code": 0,
            "message": "success",
            "data": {
                "ai_configs": ai_configs,
                "ai_api_key": user.ai_api_key or "",
                "ai_base_url": user.ai_base_url or "",
                "ai_model": user.ai_model or "",
                "has_global_key": bool(settings.OPENAI_API_KEY),
                "can_manage": user.is_staff,
            },
        })

    def put(self, request):
        if not self._check_access(request.user):
            return Response(
                {"code": 4031, "message": "无权限访问 AI 配置，请联系管理员", "data": None},
                status=status.HTTP_403_FORBIDDEN,
            )
        user = request.user
        ai_configs_data = request.data.get("ai_configs")

        if ai_configs_data is not None:
            # 新版多配置保存
            if not isinstance(ai_configs_data, list):
                return Response(
                    {"code": 2001, "message": "ai_configs 必须是数组", "data": None},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            cleaned = []
            for cfg in ai_configs_data:
                if not isinstance(cfg, dict):
                    continue
                api_key = (cfg.get("api_key") or "").strip()
                if not api_key:
                    continue  # 跳过没有 key 的空配置
                cleaned.append({
                    "name": (cfg.get("name") or "未命名配置").strip()[:50],
                    "api_key": api_key,
                    "base_url": (cfg.get("base_url") or "").strip(),
                    "model": (cfg.get("model") or "").strip(),
                    "enabled": bool(cfg.get("enabled", True)),
                })
            user.ai_configs = cleaned
            # 同步第一个配置到旧版字段（向后兼容）
            if cleaned:
                user.ai_api_key = cleaned[0]["api_key"]
                user.ai_base_url = cleaned[0]["base_url"]
                user.ai_model = cleaned[0]["model"]
            else:
                user.ai_api_key = ""
                user.ai_base_url = ""
                user.ai_model = ""
            user.save(update_fields=["ai_configs", "ai_api_key", "ai_base_url", "ai_model"])
        else:
            # 旧版单配置兼容
            user.ai_api_key = request.data.get("ai_api_key", user.ai_api_key or "")
            user.ai_base_url = request.data.get("ai_base_url", user.ai_base_url or "")
            user.ai_model = request.data.get("ai_model", user.ai_model or "")
            user.save(update_fields=["ai_api_key", "ai_base_url", "ai_model"])

        return Response({
            "code": 0,
            "message": "AI 配置已保存",
            "data": {
                "ai_configs": user.ai_configs or [],
                "ai_api_key": user.ai_api_key or "",
                "ai_base_url": user.ai_base_url or "",
                "ai_model": user.ai_model or "",
                "has_global_key": bool(settings.OPENAI_API_KEY),
                "can_manage": user.is_staff,
            },
        })


class AIAuthManageView(APIView):
    """管理员管理 AI 授权用户列表"""
    permission_classes = [IsAuthenticated, IsAdminUser]

    def get(self, request):
        """获取所有用户及其 AI 授权状态"""
        users = User.objects.all().values("id", "phone", "nickname", "is_staff", "ai_authorized").order_by("-date_joined")
        return Response({"code": 0, "message": "success", "data": list(users)})

    def post(self, request):
        """切换用户 AI 授权"""
        user_id = request.data.get("user_id")
        authorized = request.data.get("ai_authorized")
        if not user_id:
            return Response(
                {"code": 2001, "message": "缺少 user_id", "data": None},
                status=status.HTTP_400_BAD_REQUEST,
            )
        target = User.objects.filter(id=user_id).first()
        if not target:
            return Response(
                {"code": 2002, "message": "用户不存在", "data": None},
                status=status.HTTP_404_NOT_FOUND,
            )
        target.ai_authorized = bool(authorized)
        target.save(update_fields=["ai_authorized"])
        return Response({"code": 0, "message": "已更新授权状态", "data": None})


class RegistrationManageView(APIView):
    """管理员管理注册模式和邀请链接"""
    permission_classes = [IsAuthenticated, IsAdminUser]

    def get(self, request):
        """获取注册模式和邀请链接列表"""
        setting = SystemSetting.get_settings()
        invites = InviteLink.objects.select_related("created_by").all()[:50]
        invite_data = [
            {
                "id": inv.id,
                "token": inv.token,
                "max_uses": inv.max_uses,
                "used_count": inv.used_count,
                "remaining_uses": inv.remaining_uses,
                "is_valid": inv.is_valid,
                "is_active": inv.is_active,
                "expires_at": inv.expires_at.isoformat() if inv.expires_at else None,
                "note": inv.note,
                "created_by": inv.created_by.nickname or inv.created_by.phone,
                "created_at": inv.created_at.isoformat(),
            }
            for inv in invites
        ]
        return Response({
            "code": 0,
            "message": "success",
            "data": {
                "registration_mode": setting.registration_mode,
                "invites": invite_data,
            },
        })

    def post(self, request):
        """切换注册模式 或 创建邀请链接"""
        action = request.data.get("action", "")

        if action == "set_mode":
            mode = request.data.get("mode", "")
            if mode not in ("open", "invitation_only"):
                return Response(
                    {"code": 2001, "message": "无效的注册模式", "data": None},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            setting = SystemSetting.get_settings()
            setting.registration_mode = mode
            setting.save(update_fields=["registration_mode"])
            return Response({
                "code": 0,
                "message": f"已切换为{'开放注册' if mode == 'open' else '邀请注册'}模式",
                "data": {"mode": mode},
            })

        if action == "create_invite":
            max_uses = int(request.data.get("max_uses", 1))
            expire_hours = request.data.get("expire_hours")
            note = request.data.get("note", "")

            expires_at = None
            if expire_hours:
                from datetime import timedelta
                import django.utils.timezone as tz
                expires_at = tz.now() + timedelta(hours=int(expire_hours))

            invite = InviteLink.objects.create(
                created_by=request.user,
                max_uses=max_uses,
                expires_at=expires_at,
                note=note,
            )
            return Response({
                "code": 0,
                "message": "邀请链接已生成",
                "data": {
                    "token": invite.token,
                    "register_url": f"/register?invite={invite.token}",
                    "max_uses": invite.max_uses,
                    "expires_at": invite.expires_at.isoformat() if invite.expires_at else None,
                },
            })

        if action == "deactivate_invite":
            invite_id = request.data.get("invite_id")
            invite = InviteLink.objects.filter(id=invite_id).first()
            if not invite:
                return Response(
                    {"code": 2002, "message": "邀请链接不存在", "data": None},
                    status=status.HTTP_404_NOT_FOUND,
                )
            invite.is_active = False
            invite.save(update_fields=["is_active"])
            return Response({"code": 0, "message": "已停用该邀请链接", "data": None})

        if action == "delete_invite":
            invite_id = request.data.get("invite_id")
            InviteLink.objects.filter(id=invite_id).delete()
            return Response({"code": 0, "message": "已删除该邀请链接", "data": None})

        return Response(
            {"code": 2001, "message": "无效的操作", "data": None},
            status=status.HTTP_400_BAD_REQUEST,
        )


@api_view(["POST"])
@permission_classes([AllowAny])
def verify_invite(request):
    """验证邀请链接是否有效（公开接口，注册页面未登录时调用）"""
    token = request.data.get("token", "")
    try:
        invite = InviteLink.objects.get(token=token)
    except InviteLink.DoesNotExist:
        return Response({"code": 0, "message": "success", "data": {"valid": False, "reason": "链接不存在"}})
    if not invite.is_valid:
        from django.utils import timezone as tz
        reason = "链接已过期" if invite.expires_at and invite.expires_at < tz.now() else "链接已用完或已停用"
        return Response({"code": 0, "message": "success", "data": {"valid": False, "reason": reason}})
    return Response({
        "code": 0,
        "message": "success",
        "data": {
            "valid": True,
            "remaining_uses": invite.remaining_uses,
            "max_uses": invite.max_uses,
            "used_count": invite.used_count,
        },
    })


class BabyViewSet(viewsets.ModelViewSet):
    serializer_class = BabyProfileSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return BabyProfile.objects.filter(user=self.request.user)

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)

    @action(detail=True, methods=["post"])
    def set_primary(self, request, pk=None):
        baby = get_object_or_404(BabyProfile, pk=pk, user=request.user)
        BabyProfile.objects.filter(user=request.user).update(is_primary=False)
        baby.is_primary = True
        baby.save()
        return Response({"code": 0, "message": "已设为默认宝宝", "data": None})


# ============ 时间轴 ============

class TimelineViewSet(viewsets.ModelViewSet):
    serializer_class = TimelineSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = TimelineEvent.objects.prefetch_related("products").all()
        stage = self.request.query_params.get("stage")
        category = self.request.query_params.get("category")
        essential = self.request.query_params.get("essential")
        if stage:
            # 支持模糊匹配：pregnancy → 所有孕期，baby → 0-1岁，toddler → 1-3岁，preschool → 3-6岁
            if stage == "pregnancy":
                qs = qs.filter(stage_type__startswith="pregnancy")
            elif stage == "baby":
                # 0-1岁：baby_age_day 全部 + baby_age_month 1-12月
                qs = qs.filter(
                    stage_type="baby_age_day"
                ) | qs.filter(
                    stage_type="baby_age_month", stage_value__lte=12
                )
            elif stage == "toddler":
                # 1-3岁：baby_age_month 13-36
                qs = qs.filter(
                    stage_type="baby_age_month", stage_value__gte=13, stage_value__lte=36
                )
            elif stage == "preschool":
                # 3-6岁：baby_age_month 37-72
                qs = qs.filter(
                    stage_type="baby_age_month", stage_value__gte=37, stage_value__lte=72
                )
            else:
                # 精确匹配：pregnancy_20w / baby_6m / baby_3d
                parts = stage.split("_")
                if len(parts) >= 2 and parts[1].rstrip("wdm").isdigit():
                    stage_value = int("".join([c for c in parts[1] if c.isdigit()]))
                    if parts[0] == "pregnancy":
                        qs = qs.filter(stage_type="pregnancy_week", stage_value=stage_value)
                    elif parts[0] == "baby":
                        suffix = parts[1][-1] if parts[1] else "d"
                        if suffix == "m":
                            qs = qs.filter(stage_type="baby_age_month", stage_value=stage_value)
                        else:
                            qs = qs.filter(stage_type="baby_age_day", stage_value=stage_value)
        if category:
            qs = qs.filter(category=category)
        if essential:
            qs = qs.filter(is_essential=True)
        return qs

    def get_permissions(self):
        """知识库写操作仅管理员"""
        if self.action in ("create", "update", "partial_update", "destroy", "export_csv", "import_csv", "import_template"):
            return [IsAuthenticated(), IsAdminUser()]
        return super().get_permissions()

    @action(detail=False, methods=["get"])
    def export_csv(self, request):
        """导出知识库 CSV（仅管理员）"""
        qs = TimelineEvent.objects.all().order_by("stage_type", "stage_value", "sort_order")
        response = HttpResponse(content_type="text/csv; charset=utf-8")
        response["Content-Disposition"] = 'attachment; filename="timeline_export.csv"'
        response.write("\ufeff")
        writer = csv.writer(response)
        writer.writerow([
            "id", "stage_type", "stage_value", "category", "title", "subtitle",
            "content", "tips", "cover_image", "is_essential", "sort_order",
        ])
        for e in qs:
            writer.writerow([
                e.id, e.stage_type, e.stage_value, e.category, e.title,
                e.subtitle or "", e.content or "", e.tips or "", e.cover_image or "",
                "是" if e.is_essential else "否", e.sort_order,
            ])
        return response

    @action(detail=False, methods=["get"])
    def import_template(self, request):
        """下载知识库导入模板 CSV（仅管理员）"""
        response = HttpResponse(content_type="text/csv; charset=utf-8")
        response["Content-Disposition"] = 'attachment; filename="timeline_import_template.csv"'
        response.write("\ufeff")
        writer = csv.writer(response)
        writer.writerow([
            "stage_type", "stage_value", "category", "title", "subtitle",
            "content", "tips", "cover_image", "is_essential", "sort_order",
        ])
        writer.writerow([
            "pregnancy_week", 10, "health", "孕10周：胎儿发育关键期",
            "神经系统快速发育", "本周宝宝……", "补充叶酸、均衡饮食",
            "", "是", 0,
        ])
        return response

    @action(detail=False, methods=["post"])
    def import_csv(self, request):
        """导入知识库 CSV（仅管理员）"""
        file = request.FILES.get("file")
        if not file:
            return Response(
                {"code": 2001, "message": "请上传 CSV 文件", "data": None},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            text = file.read().decode("utf-8-sig")
        except Exception:
            try:
                text = file.read().decode("gbk")
            except Exception:
                return Response(
                    {"code": 2001, "message": "文件编码无法识别，请使用 UTF-8 或 GBK", "data": None},
                    status=status.HTTP_400_BAD_REQUEST,
                )
        reader = csv.DictReader(io.StringIO(text))
        valid_stage_types = {c[0] for c in TimelineEvent.STAGE_TYPES}
        valid_categories = {c[0] for c in TimelineEvent.CATEGORY_CHOICES}
        created = 0
        errors = []

        def _yn(v, default=False):
            s = str(v or "").strip()
            if not s:
                return default
            return s.lower() in ("是", "true", "1", "yes", "y", "on")

        for idx, row in enumerate(reader, start=2):
            title = (row.get("title") or "").strip()
            stage_type = (row.get("stage_type") or "").strip()
            if not title or not stage_type:
                errors.append(f"第{idx}行：缺少 title 或 stage_type")
                continue
            if stage_type not in valid_stage_types:
                errors.append(f"第{idx}行：无效的阶段类型「{stage_type}」")
                continue
            try:
                stage_value = int(row.get("stage_value") or 0)
            except ValueError:
                errors.append(f"第{idx}行：stage_value 不是数字")
                continue
            category = (row.get("category") or "health").strip()
            if category not in valid_categories:
                errors.append(f"第{idx}行：无效的分类「{category}」")
                continue
            try:
                sort_order = int(row.get("sort_order") or 0)
            except ValueError:
                sort_order = 0
            TimelineEvent.objects.create(
                stage_type=stage_type,
                stage_value=stage_value,
                category=category,
                title=title,
                subtitle=(row.get("subtitle") or "").strip(),
                content=(row.get("content") or "").strip() or title,
                tips=(row.get("tips") or "").strip(),
                cover_image=(row.get("cover_image") or "").strip() or None,
                is_essential=_yn(row.get("is_essential")),
                sort_order=sort_order,
            )
            created += 1
        return Response({
            "code": 0,
            "message": f"导入完成：成功 {created} 条" + (f"，{len(errors)} 条失败" if errors else ""),
            "data": {"created": created, "errors": errors},
        })


# ============ 商品 ============

class ProductViewSet(viewsets.ModelViewSet):
    serializer_class = ProductSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        # 管理员可以查看所有商品（含下架/暂存），普通用户只看上架商品
        if self.request.user.is_staff:
            qs = Product.objects.all()
        else:
            qs = Product.objects.filter(is_active=True)

        category = self.request.query_params.get("category")
        brand = self.request.query_params.get("brand")
        q = self.request.query_params.get("q")
        sort = self.request.query_params.get("sort")
        if category:
            qs = qs.filter(first_category=category)
        if brand:
            qs = qs.filter(brand=brand)
        if q:
            qs = qs.filter(name__icontains=q)
        if sort == "rating":
            qs = qs.order_by("-overall_rating")
        elif sort == "price_asc":
            qs = qs.order_by("price_info__avg")
        elif sort == "price_desc":
            qs = qs.order_by("-price_info__avg")
        else:
            qs = qs.order_by("-is_essential", "-overall_rating")
        return qs

    def get_permissions(self):
        """只有管理员可以创建/更新/删除商品"""
        if self.action in ("create", "update", "partial_update", "destroy", "import_csv", "export_csv", "import_template"):
            return [IsAuthenticated(), IsAdminUser()]
        return super().get_permissions()

    def retrieve(self, request, *args, **kwargs):
        """详情页：普通用户访问暂存商品返回 404"""
        product = self.get_object()
        if not request.user.is_staff and not product.is_active:
            return Response(
                {"code": 2002, "message": "商品不存在或已下架", "data": None},
                status=status.HTTP_404_NOT_FOUND,
            )
        return Response({"code": 0, "message": "success", "data": ProductSerializer(product).data})

    @action(detail=False, methods=["get"])
    def export_csv(self, request):
        """导出商品 CSV（仅管理员）"""
        qs = Product.objects.all().order_by("id")
        response = HttpResponse(content_type="text/csv; charset=utf-8")
        response["Content-Disposition"] = 'attachment; filename="products_export.csv"'
        response.write("\ufeff")  # BOM 使 Excel 正确识别 UTF-8
        writer = csv.writer(response)
        writer.writerow([
            "id", "name", "brand", "model", "first_category", "second_category",
            "image_url", "description", "overall_rating", "price_avg", "price_range",
            "is_essential", "is_active", "has_ccc_certification", "safety_alert",
            "applicable_age_start", "applicable_age_end", "applicable_season",
        ])
        for p in qs:
            writer.writerow([
                p.id, p.name, p.brand, p.model or "", p.first_category, p.second_category,
                p.image_url, p.description or "", p.overall_rating,
                (p.price_info or {}).get("avg", ""), (p.price_info or {}).get("range", ""),
                "是" if p.is_essential else "否", "是" if p.is_active else "否",
                "是" if p.has_ccc_certification else "否", p.safety_alert or "",
                p.applicable_age_start or "", p.applicable_age_end or "", p.applicable_season or "",
            ])
        return response

    @action(detail=False, methods=["get"])
    def import_template(self, request):
        """下载商品导入模板 CSV（仅管理员）"""
        response = HttpResponse(content_type="text/csv; charset=utf-8")
        response["Content-Disposition"] = 'attachment; filename="products_import_template.csv"'
        response.write("\ufeff")
        writer = csv.writer(response)
        writer.writerow([
            "name", "brand", "model", "first_category", "second_category",
            "image_url", "description", "overall", "price_avg", "price_range",
            "is_essential", "is_active", "has_ccc_certification", "safety_alert",
            "applicable_age_start", "applicable_age_end", "applicable_season",
        ])
        # 示例行
        writer.writerow([
            "婴儿连体衣", "英氏", "YSS-01", "clothing", "连体衣",
            "https://example.com/1.jpg", "纯棉A类，透气亲肤", 8.5, 129, "99-159",
            "是", "是", "是", "注意按需购买，避免囤货过多", 0, 6, "all",
        ])
        return response

    @action(detail=False, methods=["post"])
    def import_csv(self, request):
        """导入商品 CSV（仅管理员）"""
        file = request.FILES.get("file")
        if not file:
            return Response(
                {"code": 2001, "message": "请上传 CSV 文件", "data": None},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            text = file.read().decode("utf-8-sig")
        except Exception:
            try:
                text = file.read().decode("gbk")
            except Exception:
                return Response(
                    {"code": 2001, "message": "文件编码无法识别，请使用 UTF-8 或 GBK", "data": None},
                    status=status.HTTP_400_BAD_REQUEST,
                )
        reader = csv.DictReader(io.StringIO(text))
        valid_categories = {c[0] for c in Product.FIRST_CATEGORY_CHOICES}
        created = 0
        errors = []

        def _yn(v, default=False):
            s = str(v or "").strip()
            if not s:
                return default
            return s.lower() in ("是", "true", "1", "yes", "y", "on")

        for idx, row in enumerate(reader, start=2):
            name = (row.get("name") or "").strip()
            brand = (row.get("brand") or "").strip()
            if not name or not brand:
                errors.append(f"第{idx}行：缺少 name 或 brand")
                continue
            first_category = (row.get("first_category") or "").strip()
            if first_category not in valid_categories:
                errors.append(f"第{idx}行：无效的一级分类「{first_category}」")
                continue
            try:
                overall = float(row.get("overall") or 0)
            except ValueError:
                overall = 0
            try:
                price_avg = float(row.get("price_avg") or 0)
            except ValueError:
                price_avg = 0
            try:
                age_start = int(row.get("applicable_age_start")) if row.get("applicable_age_start") else None
            except ValueError:
                age_start = None
            try:
                age_end = int(row.get("applicable_age_end")) if row.get("applicable_age_end") else None
            except ValueError:
                age_end = None
            Product.objects.create(
                name=name,
                brand=brand,
                model=(row.get("model") or "").strip(),
                first_category=first_category,
                second_category=(row.get("second_category") or "默认").strip(),
                image_url=(row.get("image_url") or "").strip() or f"https://placehold.co/300x300/fef3c7/f97316?text={name[:4]}",
                description=(row.get("description") or "").strip(),
                overall_rating=overall,
                price_info={"avg": price_avg, "range": (row.get("price_range") or str(price_avg)).strip()},
                is_essential=_yn(row.get("is_essential")),
                is_active=_yn(row.get("is_active"), True),
                has_ccc_certification=_yn(row.get("has_ccc_certification")),
                safety_alert=(row.get("safety_alert") or "").strip(),
                applicable_age_start=age_start,
                applicable_age_end=age_end,
                applicable_season=(row.get("applicable_season") or "all").strip() or "all",
            )
            created += 1
        return Response({
            "code": 0,
            "message": f"导入完成：成功 {created} 条" + (f"，{len(errors)} 条失败" if errors else ""),
            "data": {"created": created, "errors": errors},
        })


# ============ 品牌 ============

class BrandViewSet(viewsets.ModelViewSet):
    serializer_class = BrandProfileSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return BrandProfile.objects.filter(is_active=True)


# ============ 待产包 ============

class ShoppingListViewSet(viewsets.ModelViewSet):
    serializer_class = ShoppingListSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return ShoppingList.objects.filter(user=self.request.user).prefetch_related("items", "items__product")

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)

    @action(detail=False, methods=["post"])
    def generate(self, request):
        """智能生成待产包"""
        season = request.data.get("season", "all")
        delivery_method = request.data.get("delivery_method", "both")
        name = request.data.get("name", "我的待产包")
        result = ShoppingListGenerator.generate(season, delivery_method)

        shopping_list = ShoppingList.objects.create(
            user=request.user,
            name=name,
            list_type="hospital_bag",
            season=season,
            delivery_method=delivery_method,
        )
        for idx, item in enumerate(result["items"]):
            ShoppingListItem.objects.create(
                shopping_list=shopping_list,
                custom_name=item["product_name"],
                quantity=item.get("quantity", 1),
                unit=item.get("unit", "件"),
                note=item.get("note", ""),
                sort_order=idx,
            )
        for idx, doc in enumerate(result["documents"]):
            ShoppingListItem.objects.create(
                shopping_list=shopping_list,
                custom_name="【证件】" + doc["name"],
                quantity=1,
                unit="份",
                note=doc.get("note", ""),
                sort_order=100 + idx,
            )
        shopping_list.update_progress()
        return Response(
            {"code": 0, "message": "生成成功", "data": ShoppingListSerializer(shopping_list).data},
            status=status.HTTP_201_CREATED,
        )

    @action(detail=True, methods=["post"])
    def toggle_check(self, request, pk=None):
        item_id = request.data.get("item_id")
        item = get_object_or_404(
            ShoppingListItem,
            pk=item_id,
            shopping_list_id=pk,
            shopping_list__user=request.user,
        )
        item.is_checked = not item.is_checked
        item.save()
        item.shopping_list.update_progress()
        return Response({"code": 0, "message": "已更新", "data": None})


# ============ 对比 ============

class ProductCompareView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        product_ids = request.data.get("product_ids", [])
        title = request.data.get("title", "")
        products = list(Product.objects.filter(id__in=product_ids, is_active=True))
        if len(products) < 2:
            return Response(
                {"code": 2001, "message": "至少选择2个产品进行对比", "data": None},
                status=status.HTTP_400_BAD_REQUEST,
            )
        comparison = ProductComparison.objects.create(
            user=request.user,
            title=title or "未命名对比",
            category=products[0].first_category,
        )
        comparison.products.set(products)
        comparison.save_snapshot()
        data = ProductComparator.compare(products)
        return Response({"code": 0, "message": "success", "data": {"comparison_id": comparison.id, **data}})


class CompareRadarView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        product_ids = request.data.get("product_ids", [])
        products = list(Product.objects.filter(id__in=product_ids, is_active=True))
        if len(products) < 2:
            return Response(
                {"code": 2001, "message": "至少选择2个产品", "data": None},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return Response({"code": 0, "message": "success", "data": ProductComparator.compare(products)["radar"]})


# ============ 健康 ============

class HealthRecordViewSet(viewsets.ModelViewSet):
    serializer_class = HealthRecordSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return HealthRecord.objects.filter(user=self.request.user)

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)


# ============ AI ============

@api_view(["POST"])
@permission_classes([IsAuthenticated])
def ai_chat(request):
    query_text = request.data.get("query", "").strip()
    if not query_text:
        return Response(
            {"code": 2001, "message": "请输入问题", "data": None},
            status=status.HTTP_400_BAD_REQUEST,
        )
    stage = get_stage_info(request.user.due_date, request.user.baby_birthday)
    result = ai_service.ai_chat(query_text, stage_label=stage["label"], user=request.user)

    AIQueryLog.objects.create(
        user=request.user,
        query_type="qa",
        query_text=query_text,
        response_text=result["response"],
        response_time_ms=result.get("latency_ms", 0),
    )
    return Response({"code": 0, "message": "success", "data": result})


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def ai_compare(request):
    product_ids = request.data.get("product_ids", [])
    query_text = request.data.get("query", "")
    products = list(Product.objects.filter(id__in=product_ids, is_active=True))
    if len(products) < 2:
        return Response(
            {"code": 2001, "message": "至少选择2个产品", "data": None},
            status=status.HTTP_400_BAD_REQUEST,
        )
    stage = get_stage_info(request.user.due_date, request.user.baby_birthday)
    result = ai_service.ai_compare(query_text, products, stage_label=stage["label"], user=request.user)
    return Response({"code": 0, "message": "success", "data": result})


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def ai_history(request):
    logs = AIQueryLog.objects.filter(user=request.user)[:50]
    data = [
        {
            "id": log.id,
            "query": log.query_text,
            "response": log.response_text,
            "created_at": log.created_at.isoformat(),
        }
        for log in logs
    ]
    return Response({"code": 0, "message": "success", "data": data})


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def ai_suggestions(request):
    stage = get_stage_info(request.user.due_date, request.user.baby_birthday)
    return Response({"code": 0, "message": "success", "data": ai_service._suggestions(stage["label"])})


# ============ 通知 ============

class NotificationViewSet(viewsets.ModelViewSet):
    serializer_class = NotificationSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return Notification.objects.filter(user=self.request.user)

    @action(detail=True, methods=["post"])
    def mark_read(self, request, pk=None):
        notification = get_object_or_404(Notification, pk=pk, user=request.user)
        notification.is_read = True
        notification.save()
        return Response({"code": 0, "message": "已读", "data": None})

    @action(detail=False, methods=["post"])
    def read_all(self, request):
        self.get_queryset().update(is_read=True)
        return Response({"code": 0, "message": "已全部标记已读", "data": None})

    @action(detail=False, methods=["get"])
    def unread_count(self, request):
        count = self.get_queryset().filter(is_read=False).count()
        return Response({"code": 0, "message": "success", "data": {"count": count}})


# ============ 收藏 ============

class FavoriteViewSet(viewsets.ModelViewSet):
    serializer_class = FavoriteSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return UserFavorite.objects.filter(user=self.request.user)

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)


# ============ 用户管理 ============

class AuditLogView(APIView):
    """管理员审计日志管理：查看 / 删除（单个、批量、全部）/ 设置保留期限"""
    permission_classes = [IsAuthenticated, IsAdminUser]

    ACTION_LABELS = dict(AuditLog.ACTION_CHOICES)

    def get(self, request):
        """日志列表，支持筛选：action / keyword（账号或目标名）/ date（YYYY-MM-DD）"""
        qs = AuditLog.objects.all()
        action = request.query_params.get("action", "")
        keyword = request.query_params.get("keyword", "")
        date = request.query_params.get("date", "")
        if action:
            qs = qs.filter(action=action)
        if keyword:
            qs = qs.filter(
                models.Q(username__icontains=keyword)
                | models.Q(target_name__icontains=keyword)
                | models.Q(detail__icontains=keyword)
            )
        if date:
            qs = qs.filter(created_at__date=date)

        # 自动清理超过保留期限的日志
        setting = SystemSetting.get_settings()
        if setting.audit_retention_days > 0:
            from django.utils import timezone
            from datetime import timedelta
            cutoff = timezone.now() - timedelta(days=setting.audit_retention_days)
            qs.filter(created_at__lt=cutoff).delete()

        logs = qs[:500].values(
            "id", "username", "action", "action_label", "target_type",
            "target_id", "target_name", "detail", "ip", "created_at",
        )
        # 统计各操作类型数量（供筛选下拉框）
        stats = {k: v for k, v in AuditLog.objects.values_list("action").annotate(c=models.Count("id"))}
        return Response({"code": 0, "message": "success", "data": {
            "logs": list(logs),
            "stats": stats,
            "action_labels": AuditLog.ACTION_CHOICES,
            "audit_retention_days": setting.audit_retention_days,
        }})

    def delete(self, request):
        """删除日志：?ids=1,2,3 或 ?all=1（全部）"""
        all_flag = request.query_params.get("all", "")
        if all_flag == "1":
            AuditLog.objects.all().delete()
            audit(request, "audit_delete", "清空全部审计日志", "系统", 0, "全部", "管理员清空全部审计日志")
            return Response({"code": 0, "message": "已清空全部审计日志", "data": None})
        ids = request.query_params.get("ids", "")
        if not ids:
            return Response(
                {"code": 2005, "message": "请指定要删除的日志ID", "data": None},
                status=status.HTTP_400_BAD_REQUEST,
            )
        id_list = [x for x in ids.split(",") if x.isdigit()]
        deleted, _ = AuditLog.objects.filter(id__in=id_list).delete()
        audit(request, "audit_delete", "删除审计日志", "audit", ",".join(id_list),
              f"{deleted} 条", f"管理员删除 {deleted} 条审计日志")
        return Response({"code": 0, "message": f"已删除 {deleted} 条日志", "data": {"deleted": deleted}})

    def put(self, request):
        """设置审计日志保留期限（天，0=永久）"""
        days = request.data.get("audit_retention_days")
        try:
            days = int(days)
        except (TypeError, ValueError):
            return Response(
                {"code": 2006, "message": "保留期限必须是整数（天）", "data": None},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if days < 0 or days > 3650:
            return Response(
                {"code": 2006, "message": "保留期限范围为 0-3650 天", "data": None},
                status=status.HTTP_400_BAD_REQUEST,
            )
        setting = SystemSetting.get_settings()
        setting.audit_retention_days = days
        setting.save(update_fields=["audit_retention_days"])
        audit(request, "audit_retention", "设置审计保留期限", "系统", 1, "全局",
              f"审计日志保留期限设置为 {days} 天（0=永久）")
        return Response({"code": 0, "message": "保留期限已更新", "data": {"audit_retention_days": days}})


class UserManageView(APIView):
    """管理员用户管理：获取用户列表 / 修改用户信息 / 重置密码 / 冻结解冻"""
    permission_classes = [IsAuthenticated, IsAdminUser]

    def get(self, request):
        users = User.objects.all().order_by("-date_joined").values(
            "id", "phone", "username", "nickname", "role", "is_staff",
            "is_active", "ai_authorized", "security_question",
            "security_answer", "login_fail_count", "security_fail_count",
            "created_at",
        )
        setting = SystemSetting.get_settings()
        return Response({"code": 0, "message": "success", "data": {
            "users": list(users),
            "security_config": {
                "login_captcha_threshold": setting.login_captcha_threshold,
                "login_freeze_threshold": setting.login_freeze_threshold,
                "login_lock_minutes": setting.login_lock_minutes,
            },
        }})

    def put(self, request):
        """修改指定用户信息（nickname / role / is_staff / is_active）或安全风控配置"""
        user_id = request.data.get("user_id")
        # 安全风控阈值配置（不含 user_id）
        if user_id is None:
            setting = SystemSetting.get_settings()
            if "login_captcha_threshold" in request.data:
                setting.login_captcha_threshold = max(1, int(request.data.get("login_captcha_threshold", 3)))
            if "login_freeze_threshold" in request.data:
                setting.login_freeze_threshold = max(2, int(request.data.get("login_freeze_threshold", 10)))
            if "login_lock_minutes" in request.data:
                setting.login_lock_minutes = max(0, int(request.data.get("login_lock_minutes", 5)))
            setting.save(update_fields=["login_captcha_threshold", "login_freeze_threshold", "login_lock_minutes"])
            audit(request, "security_config", "修改安全风控配置", "系统", 1, "全局",
                  f"验证码阈值={setting.login_captcha_threshold}，冻结阈值={setting.login_freeze_threshold}，锁定时长={setting.login_lock_minutes}分钟")
            return Response({"code": 0, "message": "安全风控配置已更新", "data": {
                "login_captcha_threshold": setting.login_captcha_threshold,
                "login_freeze_threshold": setting.login_freeze_threshold,
                "login_lock_minutes": setting.login_lock_minutes,
            }})
        target = User.objects.filter(id=user_id).first()
        if not target:
            return Response(
                {"code": 2002, "message": "用户不存在", "data": None},
                status=status.HTTP_404_NOT_FOUND,
            )
        if "nickname" in request.data:
            target.nickname = request.data["nickname"]
        if "role" in request.data:
            target.role = request.data["role"]
        if "is_staff" in request.data:
            target.is_staff = bool(request.data["is_staff"])
        if "is_active" in request.data:
            target.is_active = bool(request.data["is_active"])
        target.save()
        # 区分操作类型：冻结/解冻 或 常规编辑
        if "is_active" in request.data:
            audit(request,
                  "user_freeze" if not target.is_active else "user_unfreeze",
                  "冻结账号" if not target.is_active else "解冻账号",
                  "用户", target.id, target.nickname or target.username,
                  f"{'冻结' if not target.is_active else '解冻'}用户 {target.username}")
        else:
            audit(request, "user_update", "编辑用户", "用户", target.id,
                  target.nickname or target.username,
                  f"修改用户 {target.username}：昵称/角色/状态变更")
        return Response({"code": 0, "message": "已更新用户信息", "data": {
            "id": target.id, "phone": target.phone, "username": target.username,
            "nickname": target.nickname, "role": target.role,
            "is_staff": target.is_staff, "is_active": target.is_active,
        }})

    def post(self, request):
        """重置指定用户密码"""
        user_id = request.data.get("user_id")
        new_password = request.data.get("new_password", "")
        if len(new_password) < 6:
            return Response(
                {"code": 2001, "message": "密码至少6位", "data": None},
                status=status.HTTP_400_BAD_REQUEST,
            )
        target = User.objects.filter(id=user_id).first()
        if not target:
            return Response(
                {"code": 2002, "message": "用户不存在", "data": None},
                status=status.HTTP_404_NOT_FOUND,
            )
        target.set_password(new_password)
        target.save()
        audit(request, "user_reset_password", "管理员重置密码", "用户", target.id,
              target.nickname or target.username, f"管理员重置用户 {target.username} 的密码")
        return Response({"code": 0, "message": "密码已重置", "data": None})

    def delete(self, request):
        """管理员删除指定用户"""
        user_id = request.query_params.get("user_id")
        target = User.objects.filter(id=user_id).first()
        if not target:
            return Response(
                {"code": 2002, "message": "用户不存在", "data": None},
                status=status.HTTP_404_NOT_FOUND,
            )
        if target.id == request.user.id:
            return Response(
                {"code": 2003, "message": "不能删除自己", "data": None},
                status=status.HTTP_400_BAD_REQUEST,
            )
        audit(request, "user_delete", "删除用户", "用户", target.id,
              target.nickname or target.username, f"管理员删除用户 {target.username}（{target.phone}）")
        target.delete()
        return Response({"code": 0, "message": "用户已删除", "data": None})

    def patch(self, request):
        """管理员修改指定用户的密保"""
        user_id = request.data.get("user_id")
        target = User.objects.filter(id=user_id).first()
        if not target:
            return Response(
                {"code": 2002, "message": "用户不存在", "data": None},
                status=status.HTTP_404_NOT_FOUND,
            )
        if "security_question" in request.data:
            target.security_question = request.data["security_question"]
        if "security_answer" in request.data:
            target.security_answer = request.data["security_answer"]
        target.save(update_fields=["security_question", "security_answer"])
        q_label = dict(User.SECURITY_Q_CHOICES).get(target.security_question, "")
        audit(request, "user_security", "修改用户密保", "用户", target.id,
              target.nickname or target.username, f"管理员修改用户 {target.username} 的密保")
        return Response({"code": 0, "message": "密保已更新", "data": {
            "security_question": q_label,
            "has_answer": bool(target.security_answer),
        }})


class ChangePasswordView(APIView):
    """用户修改自己的密码"""
    permission_classes = [IsAuthenticated]

    def post(self, request):
        old_password = request.data.get("old_password", "")
        new_password = request.data.get("new_password", "")
        if not request.user.check_password(old_password):
            return Response(
                {"code": 1003, "message": "原密码不正确", "data": None},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if len(new_password) < 6:
            return Response(
                {"code": 2001, "message": "新密码至少6位", "data": None},
                status=status.HTTP_400_BAD_REQUEST,
            )
        request.user.set_password(new_password)
        request.user.save()
        audit(request, "change_password", "修改密码", "用户", request.user.username,
              request.user.nickname or request.user.username, "用户自助修改密码")
        return Response({"code": 0, "message": "密码修改成功", "data": None})


class SecurityQuestionView(APIView):
    """用户密保管理"""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        user = request.user
        return Response({"code": 0, "message": "success", "data": {
            "security_question": user.security_question,
            "has_answer": bool(user.security_answer),
        }})

    def put(self, request):
        user = request.user
        q = request.data.get("security_question", "")
        a = request.data.get("security_answer", "")
        if q and q not in [k for k, _ in User.SECURITY_Q_CHOICES]:
            return Response(
                {"code": 2001, "message": "无效的密保问题", "data": None},
                status=status.HTTP_400_BAD_REQUEST,
            )
        user.security_question = q
        user.security_answer = a
        user.save(update_fields=["security_question", "security_answer"])
        audit(request, "security_question", "设置密保", "用户", user.username,
              user.nickname or user.username, f"密保问题：{dict(User.SECURITY_Q_CHOICES).get(q, q)}")
        return Response({"code": 0, "message": "密保已设置", "data": None})


class ForgotPasswordView(APIView):
    """通过密保找回密码（公开接口，支持手机号或用户名查询）"""
    permission_classes = [AllowAny]

    def get(self, request):
        """根据账号（手机号或用户名）获取密保问题"""
        account = request.query_params.get("phone", "")
        user = _find_user_by_account(account)
        if not user:
            return Response(
                {"code": 2002, "message": "该账号未注册", "data": None},
                status=status.HTTP_404_NOT_FOUND,
            )
        if not user.security_question:
            return Response(
                {"code": 2003, "message": "该用户未设置密保问题，请联系管理员重置", "data": None},
                status=status.HTTP_400_BAD_REQUEST,
            )
        q_label = dict(User.SECURITY_Q_CHOICES).get(user.security_question, "")
        return Response({"code": 0, "message": "success", "data": {"security_question": q_label}})

    def post(self, request):
        """验证密保答案（不重置密码），带失败次数风控"""
        account = request.data.get("phone", "")
        answer = request.data.get("security_answer", "")
        user = _find_user_by_account(account)
        if not user:
            return Response(
                {"code": 2002, "message": "该账号未注册", "data": None},
                status=status.HTTP_404_NOT_FOUND,
            )
        if not user.security_answer:
            return Response(
                {"code": 2003, "message": "该用户未设置密保问题", "data": None},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if user.security_answer != answer:
            fail_count = user.security_fail_count + 1
            user.security_fail_count = fail_count
            user.save(update_fields=["security_fail_count"])
            sec = _security_setting()
            if fail_count >= sec["captcha_threshold"]:
                return Response(
                    {
                        "code": 1010,
                        "message": "密保答案连续错误次数过多，请输入验证码后继续",
                        "data": {"need_captcha": True, "fail_count": fail_count, "threshold": sec["captcha_threshold"]},
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )
            return Response(
                {"code": 1004, "message": "密保答案不正确", "data": None},
                status=status.HTTP_400_BAD_REQUEST,
            )
        user.security_fail_count = 0
        user.save(update_fields=["security_fail_count"])
        return Response({"code": 0, "message": "答案正确", "data": None})

    def put(self, request):
        """验证密保答案并重置密码（需先通过验证码校验）"""
        account = request.data.get("phone", "")
        answer = request.data.get("security_answer", "")
        new_password = request.data.get("new_password", "")
        captcha = request.data.get("captcha", "")
        user = _find_user_by_account(account)
        if not user:
            return Response(
                {"code": 2002, "message": "该账号未注册", "data": None},
                status=status.HTTP_404_NOT_FOUND,
            )
        if not user.security_answer:
            return Response(
                {"code": 2003, "message": "该用户未设置密保问题", "data": None},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if user.security_answer != answer:
            return Response(
                {"code": 1004, "message": "密保答案不正确", "data": None},
                status=status.HTTP_400_BAD_REQUEST,
            )
        # 风控：若累计失败次数达到阈值，必须携带正确验证码
        sec = _security_setting()
        if user.security_fail_count >= sec["captcha_threshold"]:
            expected = request.session.get("login_captcha", "")
            if not captcha or captcha.lower() != str(expected).lower():
                return Response(
                    {
                        "code": 1011,
                        "message": "验证码不正确，请重新输入",
                        "data": {"need_captcha": True, "fail_count": user.security_fail_count, "threshold": sec["captcha_threshold"]},
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )
        if len(new_password) < 6:
            return Response(
                {"code": 2001, "message": "新密码至少6位", "data": None},
                status=status.HTTP_400_BAD_REQUEST,
            )
        user.set_password(new_password)
        user.security_fail_count = 0
        user.save()
        request.session.pop("login_captcha", None)
        return Response({"code": 0, "message": "密码已重置，请使用新密码登录", "data": None})


class UserDeleteView(APIView):
    """管理员删除用户 / 用户注销自己"""
    permission_classes = [IsAuthenticated]

    def delete(self, request):
        """用户注销自己的账号（管理员账号不可自助注销）"""
        user = request.user
        if user.is_staff:
            return Response(
                {"code": 2004, "message": "管理员账号不可自助注销，请通过其他管理员操作", "data": None},
                status=status.HTTP_400_BAD_REQUEST,
            )
        RefreshToken.for_user(user)  # 使 token 失效
        audit(request, "delete_account", "注销账号", "用户", user.username,
              user.nickname or user.username, f"用户自助注销账号 {user.username}")
        user.delete()
        return Response({"code": 0, "message": "账号已注销", "data": None})