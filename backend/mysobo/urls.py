from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import include, path
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView
from rest_framework.authtoken.views import obtain_auth_token
from accounts.views import OTPRequestView, OTPVerifyView
from directory.portal_views import (
    AdminBusinessesView,
    AdminBusinessImportView,
    AdminBusinessVerifyView,
    AdminClaimsView,
    AdminDashboardView,
    AdminPaymentsView,
    AdminPlanRequestsView,
    AdminPlansView,
    CurrentUserView,
    LogoutView,
    OwnerBusinessesView,
    OwnerClaimableBusinessesView,
    OwnerClaimsView,
    OwnerPlansView,
    OwnerPostsView,
)

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/schema/", SpectacularAPIView.as_view(), name="schema"),
    path("api/docs/", SpectacularSwaggerView.as_view(url_name="schema")),
    path("api/auth/login/", obtain_auth_token, name="auth-login"),
    path("api/auth/otp/request/", OTPRequestView.as_view(), name="auth-otp-request"),
    path("api/auth/otp/verify/", OTPVerifyView.as_view(), name="auth-otp-verify"),
    path("api/auth/me/", CurrentUserView.as_view(), name="auth-me"),
    path("api/auth/logout/", LogoutView.as_view(), name="auth-logout"),
    path("api/owner/businesses/", OwnerBusinessesView.as_view(), name="owner-businesses"),
    path("api/owner/claimable/", OwnerClaimableBusinessesView.as_view(), name="owner-claimable"),
    path("api/owner/claims/", OwnerClaimsView.as_view(), name="owner-claims"),
    path("api/owner/posts/", OwnerPostsView.as_view(), name="owner-posts"),
    path("api/owner/plans/", OwnerPlansView.as_view(), name="owner-plans"),
    path("api/admin/dashboard/", AdminDashboardView.as_view(), name="admin-dashboard"),
    path("api/admin/claims/", AdminClaimsView.as_view(), name="admin-claims"),
    path("api/admin/businesses/", AdminBusinessesView.as_view(), name="admin-businesses"),
    path("api/admin/businesses/import/", AdminBusinessImportView.as_view(), name="admin-business-import"),
    path("api/admin/businesses/<uuid:business_id>/verify/", AdminBusinessVerifyView.as_view(), name="admin-business-verify"),
    path("api/admin/plan-requests/", AdminPlanRequestsView.as_view(), name="admin-plan-requests"),
    path("api/admin/plans/", AdminPlansView.as_view(), name="admin-plans"),
    path("api/admin/payments/", AdminPaymentsView.as_view(), name="admin-payments"),
    path("api/", include("directory.urls")),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
