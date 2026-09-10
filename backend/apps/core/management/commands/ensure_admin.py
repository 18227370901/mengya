"""确保管理员账号存在 —— 启动时自动创建或更新管理员

用法：
  python manage.py ensure_admin
  ADMIN_USERNAME=xxx ADMIN_PASSWORD=xxx python manage.py ensure_admin

环境变量：
  ADMIN_USERNAME    管理员账号（手机号或用户名，默认 13800000001）
  ADMIN_PASSWORD    管理员密码（默认 admin123）
  ADMIN_NICKNAME    管理员昵称（默认 管理员）
"""
import os

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand

User = get_user_model()


class Command(BaseCommand):
    help = "确保管理员账号存在（不存在则创建，存在则更新密码和权限）"

    def handle(self, *args, **options):
        account = os.getenv("ADMIN_USERNAME") or os.getenv("ADMIN_PHONE") or "13800000001"
        password = os.getenv("ADMIN_PASSWORD", "admin123")
        nickname = os.getenv("ADMIN_NICKNAME", "管理员")

        # 先按 phone 查找，再按 username 查找（兼容历史数据）
        user = User.objects.filter(phone=account).first() or User.objects.filter(username=account).first()
        if user:
            # 已存在：更新密码与权限
            user.set_password(password)
            user.is_staff = True
            user.is_superuser = True
            user.is_active = True
            user.nickname = nickname
            user.ai_authorized = True
            user.save()
            self.stdout.write(
                self.style.SUCCESS(f"管理员账号已更新：{account}（昵称：{nickname}）")
            )
        else:
            # 不存在：创建（phone 和 username 均设为 account）
            user = User.objects.create_user(
                phone=account,
                username=account,
                password=password,
                nickname=nickname,
                is_staff=True,
                is_superuser=True,
                ai_authorized=True,
            )
            self.stdout.write(
                self.style.SUCCESS(f"管理员账号已创建：{account}（昵称：{nickname}）")
            )
