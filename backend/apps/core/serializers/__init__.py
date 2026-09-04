from django.contrib.auth import get_user_model
from rest_framework import serializers

from ..models import (
    BabyProfile,
    BrandProfile,
    HealthRecord,
    Notification,
    Product,
    ShoppingList,
    ShoppingListItem,
    TimelineEvent,
    UserFavorite,
)

User = get_user_model()


class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = [
            "id",
            "phone",
            "username",
            "nickname",
            "role",
            "avatar",
            "due_date",
            "baby_birthday",
            "is_pregnant",
            "bio",
            "is_public_profile",
            "is_staff",
            "ai_api_key",
            "ai_base_url",
            "ai_model",
            "ai_authorized",
            "created_at",
        ]
        read_only_fields = ["id", "phone", "created_at"]


class RegisterSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, min_length=6)

    class Meta:
        model = User
        fields = ["phone", "password", "nickname", "role", "due_date", "baby_birthday", "is_pregnant"]

    def validate_phone(self, value):
        if not value.isdigit() or len(value) != 11:
            raise serializers.ValidationError("手机号格式不正确")
        if User.objects.filter(phone=value).exists():
            raise serializers.ValidationError("该手机号已注册")
        return value

    def create(self, validated_data):
        password = validated_data.pop("password")
        username = validated_data.get("phone")
        user = User(username=username, **validated_data)
        user.set_password(password)
        user.save()
        return user


class BabyProfileSerializer(serializers.ModelSerializer):
    age_days = serializers.SerializerMethodField()
    age_months = serializers.SerializerMethodField()

    class Meta:
        model = BabyProfile
        fields = [
            "id",
            "name",
            "gender",
            "birthday",
            "birth_weight",
            "birth_height",
            "birth_head_circumference",
            "is_primary",
            "avatar",
            "note",
            "age_days",
            "age_months",
            "created_at",
        ]
        read_only_fields = ["id", "created_at"]

    def get_age_days(self, obj):
        return obj.get_age_days()

    def get_age_months(self, obj):
        return obj.get_age_months()


class BrandProfileSerializer(serializers.ModelSerializer):
    class Meta:
        model = BrandProfile
        fields = [
            "id",
            "name",
            "name_en",
            "logo",
            "country_of_origin",
            "positioning",
            "positioning_desc",
            "market_rank",
            "market_share",
            "brand_story",
            "official_url",
            "founded_year",
            "parent_company",
        ]


class ProductSerializer(serializers.ModelSerializer):
    brand_profile = BrandProfileSerializer(read_only=True)
    first_category_label = serializers.CharField(source="get_first_category_display", read_only=True)

    class Meta:
        model = Product
        fields = [
            "id",
            "name",
            "brand",
            "brand_profile",
            "model",
            "image_url",
            "gallery_images",
            "first_category",
            "first_category_label",
            "second_category",
            "third_category",
            "specifications",
            "price_info",
            "ratings",
            "overall_rating",
            "has_ccc_certification",
            "safety_alert",
            "test_report_source",
            "market_position",
            "applicable_age_start",
            "applicable_age_end",
            "applicable_week_start",
            "applicable_week_end",
            "applicable_season",
            "description",
            "purchase_guide",
            "quantity_suggestion",
            "is_essential",
            "has_seasonal_variation",
            "has_delivery_variation",
            "is_active",
            "view_count",
            "fav_count",
        ]
        read_only_fields = ["id", "view_count", "fav_count"]


class TimelineSerializer(serializers.ModelSerializer):
    products = ProductSerializer(many=True, read_only=True)
    category_label = serializers.CharField(source="get_category_display", read_only=True)
    stage_label = serializers.CharField(source="get_stage_type_display", read_only=True)

    class Meta:
        model = TimelineEvent
        fields = [
            "id",
            "stage_type",
            "stage_value",
            "category",
            "category_label",
            "stage_label",
            "title",
            "subtitle",
            "content",
            "tips",
            "cover_image",
            "is_essential",
            "sort_order",
            "view_count",
            "products",
        ]


class ShoppingListItemSerializer(serializers.ModelSerializer):
    product = ProductSerializer(read_only=True)

    class Meta:
        model = ShoppingListItem
        fields = [
            "id",
            "product",
            "custom_name",
            "quantity",
            "quantity_prepared",
            "unit",
            "is_checked",
            "note",
            "sort_order",
        ]


class ShoppingListSerializer(serializers.ModelSerializer):
    items = ShoppingListItemSerializer(many=True, read_only=True)

    class Meta:
        model = ShoppingList
        fields = [
            "id",
            "name",
            "list_type",
            "season",
            "delivery_method",
            "total_items",
            "prepared_count",
            "progress_percent",
            "is_public",
            "is_default_template",
            "cover_image",
            "note",
            "items",
            "created_at",
            "updated_at",
        ]


class HealthRecordSerializer(serializers.ModelSerializer):
    class Meta:
        model = HealthRecord
        fields = [
            "id",
            "record_type",
            "record_date",
            "note",
            "gestational_week",
            "exam_items",
            "baby_age_days",
            "height",
            "weight",
            "head_circumference",
            "vaccine_name",
            "vaccine_dose",
            "vaccine_site",
            "attachment_url",
            "ai_analysis",
            "baby",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]

    def create(self, validated_data):
        request = self.context.get("request")
        if request and request.user.is_authenticated:
            validated_data.setdefault("user", request.user)
        return super().create(validated_data)


class NotificationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Notification
        fields = ["id", "notification_type", "title", "content", "link", "extra_data", "is_read", "created_at"]


class FavoriteSerializer(serializers.ModelSerializer):
    class Meta:
        model = UserFavorite
        fields = ["id", "favorite_type", "object_id", "note", "created_at"]