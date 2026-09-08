"""确保管理员账号存在 —— 启动时自动创建或更新管理员

用法：
  python manage.py ensure_admin
  ADMIN_PHONE=xxx ADMIN_PASSWORD=xxx python manage.py ensure_admin

环境变量：
  ADMIN_PHONE      管理员手机号（默认 13800000001）
  ADMIN_PASSWORD   管理员密码（默认 admin123）
  ADMIN_NICKNAME   管理员昵称（默认 管理员）
"""
import os

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand

User = get_user_model()


class Command(BaseCommand):
    help = "确保管理员账号存在（不存在则创建，存在则更新密码和权限）"

    def handle(self, *args, **options):
        phone = os.getenv("ADMIN_PHONE", "13800000001")
        password = os.getenv("ADMIN_PASSWORD", "admin123")
        nickname = os.getenv("ADMIN_NICKNAME", "管理员")

        user = User.objects.filter(phone=phone).first()
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
                self.style.SUCCESS(f"管理员账号已更新：{phone}（昵称：{nickname}）")
            )
        else:
            # 不存在：创建
            user = User.objects.create_user(
                phone=phone,
                username=phone,
                password=password,
                nickname=nickname,
                is_staff=True,
                is_superuser=True,
                ai_authorized=True,
            )
            self.stdout.write(
                self.style.SUCCESS(f"管理员账号已创建：{phone}（昵称：{nickname}）")
            )
