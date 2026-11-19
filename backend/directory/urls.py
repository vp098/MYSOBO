from rest_framework.routers import DefaultRouter

from .views import (
    AdminCategoryViewSet,
    AdminCategoryFieldViewSet,
    AdminSubcategoryViewSet,
    BusinessViewSet,
    BusinessProductViewSet,
    BusinessServiceViewSet,
    CategoryViewSet,
)

router = DefaultRouter()
router.register("categories", CategoryViewSet, basename="category")
router.register("businesses", BusinessViewSet, basename="business")
router.register("products", BusinessProductViewSet, basename="product")
router.register("services", BusinessServiceViewSet, basename="service")
router.register("admin/categories", AdminCategoryViewSet, basename="admin-category")
router.register("admin/subcategories", AdminSubcategoryViewSet, basename="admin-subcategory")
router.register("admin/category-fields", AdminCategoryFieldViewSet, basename="admin-category-field")

urlpatterns = router.urls
