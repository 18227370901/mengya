from django.conf import settings
from django.db import models


class AuditLog(models.Model):
    """审计日志：记录用户关键操作，供管理员审计"""

    ACTION_CHOICES = [
        ("login", "登录"),
        ("login_fail", "登录失败"),
        ("logout", "退出登录"),
        ("register", "注册"),
        ("change_password", "修改密码"),
        ("delete_account", "注销账号"),
        ("security_question", "设置密保"),
        ("user_update", "编辑用户"),
        ("user_reset_password", "重置密码"),
        ("user_freeze", "冻结账号"),
        ("user_unfreeze", "解冻账号"),
        ("user_delete", "删除用户"),
        ("user_security", "修改用户密保"),
        ("security_config", "安全风控配置"),
        ("reg_mode", "注册模式变更"),
        ("invite_create", "生成邀请链接"),
        ("invite_delete", "删除邀请链接"),
        ("ai_config", "AI 配置变更"),
        ("product_admin", "商品管理"),
        ("audit_delete", "删除审计日志"),
        ("audit_retention", "设置审计保留期限"),
    ]

    # 操作者（用户被删除后保留快照，user 可为空）
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="audit_logs",
        verbose_name="操作者",
    )
    # 操作者快照（防止用户删除后无法追溯）
    username = models.CharField(max_length=150, blank=True, default="", verbose_name="操作者账号快照")
    action = models.CharField(max_length=30, choices=ACTION_CHOICES, verbose_name="操作类型")
    action_label = models.CharField(max_length=50, blank=True, default="", verbose_name="操作说明")
    # 目标对象
    target_type = models.CharField(max_length=50, blank=True, default="", verbose_name="目标类型")
    target_id = models.CharField(max_length=20, blank=True, default="", verbose_name="目标ID")
    target_name = models.CharField(max_length=150, blank=True, default="", verbose_name="目标名称")
    # 详细内容
    detail = models.TextField(blank=True, default="", verbose_name="操作详情")
    ip = models.CharField(max_length=64, blank=True, default="", verbose_name="IP 地址")
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="操作时间")

    class Meta:
        ordering = ["-created_at"]
        verbose_name = "审计日志"
        verbose_name_plural = "审计日志"

    def __str__(self):
        return f"[{self.created_at:%Y-%m-%d %H:%M}] {self.username} {self.action_label or self.action}"