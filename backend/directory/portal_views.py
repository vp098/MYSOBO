import csv
import io
import json
import uuid
from datetime import timedelta

from django.db import IntegrityError, transaction
from django.db.models import Avg, Count, Q, Sum
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.utils.text import slugify
from rest_framework import permissions, status
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.authtoken.models import Token
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.models import AdminRole, Profile
from accounts.sessions import home_for, is_super_admin, refresh_session, sign_out
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import ensure_csrf_cookie
from billing.models import AppSetting, Invoice, Payment, PlanPrice, Subscription, SubscriptionRequest
from .models import AuditLog, Business, BusinessHour, BusinessMember, BusinessPost, Category, Claim, Event, Report, Subcategory
from .permissions import IsSuperAdmin
from .serializers import BusinessPostSerializer, BusinessSerializer


class CsrfView(APIView):
    """Sets the csrftoken cookie the browser app sends back as X-CSRFToken."""

    authentication_classes = ()
    permission_classes = (permissions.AllowAny,)

    @method_decorator(ensure_csrf_cookie)
    def get(self, request):
        return Response({"ok": True})


class CurrentUserView(APIView):
    permission_classes = (permissions.IsAuthenticated,)

    def get(self, request):
        refresh_session(request)
        user = request.user
        profile, _ = Profile.objects.get_or_create(id=user, defaults={"name": user.get_full_name()})
        return Response({
            "id": str(user.id),
            "username": user.username,
            "mobile": user.mobile,
            "email": user.email,
            "name": user.get_full_name() or profile.name,
            "is_superadmin": is_super_admin(user),
            "account_type": profile.account_type,
            "theme": profile.theme,
            "has_business": BusinessMember.objects.filter(user=user, business__deleted_at__isnull=True).exists(),
            "avatar": request.build_absolute_uri(profile.avatar.url) if profile.avatar else "",
            "home": home_for(user),
        })


class LogoutView(APIView):
    """Ends this browser's session. The account, listings and history stay."""

    permission_classes = (permissions.AllowAny,)

    def post(self, request):
        if request.user.is_authenticated and request.auth is not None:
            # Signed in with an API token: revoke that token only.
            Token.objects.filter(key=getattr(request.auth, "key", request.auth)).delete()
        sign_out(request)
        return Response(status=status.HTTP_204_NO_CONTENT)


class OwnerBusinessesView(APIView):
    permission_classes = (permissions.IsAuthenticated,)

    def get(self, request):
        businesses = list(Business.objects.filter(
            members__user=request.user, deleted_at__isnull=True
        ).select_related("category", "subcategory").prefetch_related("photos", "hours", "category__fields").annotate(
            average_rating=Avg("reviews__rating"),
            review_count=Count("reviews", distinct=True),
        ).distinct())
        data = BusinessSerializer(businesses, many=True, context={"request": request}).data
        # Owners also see why a listing was sent back, which is not public.
        notes = {str(business.id): business.verification_note for business in businesses}
        for item in data:
            item["review_note"] = notes.get(str(item["id"]), "")
        return Response(data)


class OwnerRequestApprovalView(APIView):
    """An owner asks the MySobo team to approve a listing so it goes live."""

    permission_classes = (permissions.IsAuthenticated,)

    def post(self, request, business_id):
        business = get_object_or_404(
            Business.objects.select_for_update(),
            id=business_id,
            deleted_at__isnull=True,
            members__user=request.user,
        )
        if not business.hidden:
            return Response({"detail": "This listing is already live."}, status=status.HTTP_409_CONFLICT)
        if business.approval_requested_at is None:
            business.approval_requested_at = timezone.now()
            business.save(update_fields=["approval_requested_at", "updated_at"])
            AuditLog.objects.create(
                actor=request.user,
                action="business_approval_requested",
                target_type="Business",
                target_id=str(business.id),
                after={"approval_requested_at": business.approval_requested_at.isoformat()},
            )
        return Response({
            "id": str(business.id),
            "approval_requested_at": business.approval_requested_at,
        })


class SavedBusinessesView(APIView):
    permission_classes = (permissions.IsAuthenticated,)

    def get(self, request):
        businesses = Business.objects.filter(
            savedbusiness__user=request.user,
            deleted_at__isnull=True,
            hidden=False,
        ).select_related("category", "subcategory").prefetch_related("photos", "hours", "category__fields").distinct()
        return Response(BusinessSerializer(businesses, many=True, context={"request": request}).data)


class OwnerClaimsView(APIView):
    permission_classes = (permissions.IsAuthenticated,)

    def get(self, request):
        claims = Claim.objects.filter(user=request.user).select_related("business").order_by("-created_at")
        return Response([{
            "id": str(claim.id),
            "business": claim.business.name,
            "status": claim.status,
            "note": claim.note,
            "created_at": claim.created_at,
        } for claim in claims])

    def post(self, request):
        business = get_object_or_404(
            Business.objects.filter(deleted_at__isnull=True),
            id=request.data.get("business_id"),
        )
        if BusinessMember.objects.filter(user=request.user, business=business).exists():
            return Response({"detail": "You already manage this business."}, status=status.HTTP_409_CONFLICT)
        if Claim.objects.filter(
            user=request.user, business=business, status=Claim.Status.PENDING
        ).exists():
            return Response({"detail": "Your claim is already awaiting review."}, status=status.HTTP_409_CONFLICT)
        try:
            with transaction.atomic():
                claim = Claim.objects.create(
                    business=business,
                    user=request.user,
                    proof_path=str(request.data.get("proof_path", ""))[:500],
                )
        except IntegrityError:
            return Response({"detail": "Your listing request is already awaiting review.", "code": "conflict"}, status=status.HTTP_409_CONFLICT)
        return Response({"id": str(claim.id), "business": business.name, "status": claim.status}, status=status.HTTP_201_CREATED)


class OwnerClaimableBusinessesView(APIView):
    permission_classes = (permissions.IsAuthenticated,)

    def get(self, request):
        query = request.query_params.get("q", "").strip()
        if len(query) < 2:
            return Response([])
        businesses = Business.objects.filter(
            deleted_at__isnull=True,
            name__icontains=query,
        ).exclude(members__user=request.user).distinct().select_related("category")[:20]
        return Response(BusinessSerializer(
            businesses, many=True, context={"request": request}
        ).data)


class OwnerPostsView(APIView):
    permission_classes = (permissions.IsAuthenticated,)

    def get(self, request):
        posts = BusinessPost.objects.filter(business__members__user=request.user).select_related("business")
        return Response(BusinessPostSerializer(posts, many=True).data)

    def post(self, request):
        business = get_object_or_404(
            Business, id=request.data.get("business_id"), members__user=request.user
        )
        limit_error = _offer_limit_error(business)
        if limit_error:
            return limit_error
        serializer = BusinessPostSerializer(data={
            **request.data,
            "business": str(business.id),
        })
        serializer.is_valid(raise_exception=True)
        post = serializer.save(status=BusinessPost.Status.PENDING)
        return Response(BusinessPostSerializer(post).data, status=status.HTTP_201_CREATED)


def _live_offers(business, exclude=None):
    today = timezone.localdate()
    queryset = BusinessPost.objects.filter(
        business=business, status__in=(BusinessPost.Status.PENDING, BusinessPost.Status.APPROVED)
    ).filter(Q(expires_on__isnull=True) | Q(expires_on__gte=today))
    return queryset.exclude(id=exclude) if exclude else queryset


def _offer_limit_error(business):
    from billing.limits import active_offer_limit

    limit = active_offer_limit(business.plan)
    if _live_offers(business).count() >= limit:
        return Response(
            {"detail": f"Your {business.get_plan_display()} plan allows {limit} active offer(s) per listing. "
                       "End or delete one, or upgrade your plan.", "code": "offer_limit", "limit": limit},
            status=status.HTTP_409_CONFLICT,
        )
    return None


class OwnerPostDetailView(APIView):
    """Edit or delete one of your own offers. An edited offer goes back for review."""

    permission_classes = (permissions.IsAuthenticated,)

    def _post(self, request, post_id):
        return get_object_or_404(BusinessPost, id=post_id, business__members__user=request.user)

    def patch(self, request, post_id):
        post = self._post(request, post_id)
        data = {key: request.data[key] for key in ("title", "body", "starts_on", "expires_on") if key in request.data}
        serializer = BusinessPostSerializer(post, data=data, partial=True)
        serializer.is_valid(raise_exception=True)
        post = serializer.save(status=BusinessPost.Status.PENDING, reviewed_by=None)
        return Response(BusinessPostSerializer(post).data)

    def delete(self, request, post_id):
        self._post(request, post_id).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class AvatarView(APIView):
    """Profile picture: upload (multipart field "file") or remove."""

    permission_classes = (permissions.IsAuthenticated,)
    parser_classes = (MultiPartParser, FormParser)

    def post(self, request):
        from .photo_views import PhotoError, clean_image

        upload = request.FILES.get("file")
        if not upload:
            return Response({"detail": "Choose a photo to upload."}, status=status.HTTP_400_BAD_REQUEST)
        try:
            cleaned = clean_image(upload)
        except PhotoError as error:
            return Response({"detail": str(error)}, status=status.HTTP_400_BAD_REQUEST)
        profile, _ = Profile.objects.get_or_create(id=request.user)
        if profile.avatar:
            profile.avatar.delete(save=False)
        profile.avatar.save(cleaned.name, cleaned, save=True)
        return Response({"avatar": request.build_absolute_uri(profile.avatar.url)})

    def delete(self, request):
        profile, _ = Profile.objects.get_or_create(id=request.user)
        if profile.avatar:
            profile.avatar.delete(save=True)
        return Response(status=status.HTTP_204_NO_CONTENT)


PLAN_ORDER = {"free": 0, "pro": 1, "premium": 2}


class PublicPlansView(APIView):
    """Active plans with GST added on top, for the landing and pricing pages."""

    authentication_classes = ()
    permission_classes = (permissions.AllowAny,)

    def get(self, request):
        from billing.models import GST_PERCENT, with_gst

        rows = sorted(PlanPrice.objects.filter(active=True), key=lambda row: PLAN_ORDER.get(row.plan, 9))
        return Response({
            "gst_percent": GST_PERCENT,
            "plans": [
                {"plan": row.plan, "monthly_price": row.monthly_price, "monthly_total": with_gst(row.monthly_price),
                 "max_photos": row.max_photos, "max_active_offers": row.max_active_offers}
                for row in rows
            ],
        })


class OwnerPlansView(APIView):
    permission_classes = (permissions.IsAuthenticated,)

    def get(self, request):
        businesses = Business.objects.filter(members__user=request.user).distinct()
        prices = list(PlanPrice.objects.filter(active=True).values("plan", "monthly_price", "max_photos", "max_active_offers"))
        subscriptions = list(Subscription.objects.filter(
            business__in=businesses
        ).values("id", "business_id", "plan", "status", "expires_on"))
        requests = list(SubscriptionRequest.objects.filter(
            business__in=businesses
        ).values("id", "business_id", "requested_plan", "status", "created_at"))
        return Response({"plans": prices, "subscriptions": subscriptions, "requests": requests})

    def post(self, request):
        business = get_object_or_404(
            Business, id=request.data.get("business_id"), members__user=request.user
        )
        plan = request.data.get("plan")
        if plan not in Business.Plan.values:
            return Response({"detail": "Choose a valid plan."}, status=status.HTTP_400_BAD_REQUEST)
        if not PlanPrice.objects.filter(plan=plan, active=True).exists():
            return Response({"detail": "That plan is not currently available."}, status=status.HTTP_400_BAD_REQUEST)
        existing = SubscriptionRequest.objects.filter(
            business=business, status=SubscriptionRequest.Status.PENDING
        ).first()
        if existing:
            return Response({"detail": "A plan request is already awaiting review."}, status=status.HTTP_409_CONFLICT)
        try:
            with transaction.atomic():
                plan_request = SubscriptionRequest.objects.create(
                    business=business, requested_plan=plan, requested_by=request.user
                )
        except IntegrityError:
            return Response({"detail": "A plan request is already awaiting review.", "code": "conflict"}, status=status.HTTP_409_CONFLICT)
        return Response({
            "id": str(plan_request.id),
            "status": plan_request.status,
            "requested_plan": plan_request.requested_plan,
        }, status=status.HTTP_201_CREATED)


class AdminDashboardView(APIView):
    permission_classes = (IsSuperAdmin,)

    def get(self, request):
        return Response({
            "businesses": Business.objects.filter(deleted_at__isnull=True).count(),
            "unverified": Business.objects.filter(
                deleted_at__isnull=True, verification_level__lt=2
            ).count(),
            "pending_claims": Claim.objects.filter(status=Claim.Status.PENDING).count(),
            "pending_posts": BusinessPost.objects.filter(status=BusinessPost.Status.PENDING).count(),
            "pending_plan_requests": SubscriptionRequest.objects.filter(
                status=SubscriptionRequest.Status.PENDING
            ).count(),
            "payments": Payment.objects.count(),
            "pending_approvals": Business.objects.filter(
                deleted_at__isnull=True, hidden=True, approval_requested_at__isnull=False
            ).count(),
            "pending_reports": Report.objects.filter(status="open").count(),
            "revenue_paise": Payment.objects.filter(status="paid").aggregate(total=Sum("amount_paise"))["total"] or 0,
            "verified": Business.objects.filter(
                deleted_at__isnull=True, hidden=False, verification_level__gte=2
            ).count(),
        })


class AdminClaimsView(APIView):
    permission_classes = (IsSuperAdmin,)

    def get(self, request):
        claims = Claim.objects.filter(status=Claim.Status.PENDING).select_related(
            "business", "business__category", "user"
        )
        return Response([{
            "id": str(claim.id),
            "business_id": str(claim.business_id),
            "business": claim.business.name,
            "category": claim.business.category.name if claim.business.category else "",
            "address": claim.business.address,
            "user": display_name(claim.user),
            "user_email": claim.user.email,
            "user_mobile": claim.user.mobile or "",
            "proof_path": claim.proof_path,
            "created_at": claim.created_at,
        } for claim in claims])

    @transaction.atomic
    def post(self, request):
        claim = get_object_or_404(Claim.objects.select_for_update(), id=request.data.get("claim_id"), status=Claim.Status.PENDING)
        decision = request.data.get("decision")
        if decision not in (Claim.Status.APPROVED, Claim.Status.REJECTED):
            return Response({"detail": "Decision must be approved or rejected."}, status=status.HTTP_400_BAD_REQUEST)
        claim.status = decision
        claim.note = request.data.get("note", "")
        claim.reviewed_by = request.user
        claim.reviewed_at = timezone.now()
        claim.save(update_fields=("status", "note", "reviewed_by", "reviewed_at"))
        if decision == Claim.Status.APPROVED:
            BusinessMember.objects.get_or_create(
                user=claim.user,
                business=claim.business,
                defaults={"role": BusinessMember.Role.OWNER},
            )
            # "Accept Request & Verify": owner access plus a verified, public listing.
            claim.business.verification_level = 2
            claim.business.verified_by = request.user
            claim.business.verified_on = timezone.now()
            claim.business.hidden = False
            claim.business.save(update_fields=("verification_level", "verified_by", "verified_on", "hidden", "updated_at"))
        AuditLog.objects.create(
            actor=request.user,
            action=f"listing_request_{decision}",
            target_type="Business",
            target_id=str(claim.business_id),
            after={"business": claim.business.name, "requested_by": display_name(claim.user), "note": claim.note},
        )
        return Response({"id": str(claim.id), "status": claim.status})


class AdminBusinessesView(APIView):
    permission_classes = (IsSuperAdmin,)

    def get(self, request):
        businesses = list(Business.objects.filter(deleted_at__isnull=True).select_related("category", "subcategory").prefetch_related("members__user", "photos", "hours", "category__fields"))
        data = BusinessSerializer(businesses, many=True, context={"request": request}).data
        by_id = {str(item.id): item for item in businesses}
        for row in data:
            business = by_id[str(row["id"])]
            owner = next((member.user for member in business.members.all()), None)
            row["owner_name"] = display_name(owner) if owner else ""
            row["owner_email"] = owner.email if owner else ""
            row["review_note"] = business.verification_note
            row["approval_requested_at"] = business.approval_requested_at
        return Response(data)

    def post(self, request):
        serializer = BusinessSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        business = serializer.save(
            source="field_agent",
            verification_level=1,
            hidden=True,
            created_by=request.user,
        )
        AuditLog.objects.create(
            actor=request.user,
            action="field_business_entry",
            target_type="Business",
            target_id=str(business.id),
            after={"name": business.name, "source": business.source},
        )
        return Response(
            BusinessSerializer(business, context={"request": request}).data,
            status=status.HTTP_201_CREATED,
        )


class AdminBusinessImportView(APIView):
    permission_classes = (IsSuperAdmin,)
    parser_classes = (MultiPartParser, FormParser)
    maximum_file_size = 5 * 1024 * 1024
    maximum_rows = 500
    required_headers = {"name", "kind", "category_slug"}

    def post(self, request):
        uploaded_file = request.FILES.get("file")
        if not uploaded_file:
            return Response({"detail": "Attach a CSV file using the 'file' field."}, status=status.HTTP_400_BAD_REQUEST)
        if uploaded_file.size > self.maximum_file_size:
            return Response({"detail": "CSV files must be 5 MB or smaller."}, status=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE)
        try:
            content = uploaded_file.read().decode("utf-8-sig")
            reader = csv.DictReader(io.StringIO(content))
            original_headers = reader.fieldnames or []
            header_map = {
                (header or "").strip().lower(): header
                for header in original_headers
                if (header or "").strip()
            }
            rows = list(reader)
        except (UnicodeDecodeError, csv.Error):
            return Response({"detail": "Upload a valid UTF-8 CSV file."}, status=status.HTTP_400_BAD_REQUEST)
        if len(header_map) != len([header for header in original_headers if (header or "").strip()]):
            return Response({"detail": "CSV column names must be unique."}, status=status.HTTP_400_BAD_REQUEST)
        if len(rows) > self.maximum_rows:
            return Response({"detail": "A maximum of 500 records may be imported at once."}, status=status.HTTP_400_BAD_REQUEST)
        headers = set(header_map)
        missing_headers = sorted(self.required_headers - headers)
        if missing_headers:
            return Response(
                {"detail": "The CSV is missing required columns.", "missing_headers": missing_headers},
                status=status.HTTP_400_BAD_REQUEST,
            )

        categories = {
            category.slug: category
            for category in Category.objects.filter(active=True)
        }
        subcategories = {
            (subcategory.category_id, subcategory.slug): subcategory
            for subcategory in Subcategory.objects.filter(active=True, approved=True)
        }
        used_slugs = set(Business.objects.values_list("slug", flat=True))
        prepared = []
        errors = []
        for row_number, raw_row in enumerate(rows, start=2):
            if None in raw_row:
                errors.append({"row": row_number, "errors": {"file": "This row has more columns than the CSV header."}})
                continue
            row = {
                normalized_key: (raw_row.get(original_key) or "").strip()
                for normalized_key, original_key in header_map.items()
            }
            if not any(row.values()):
                continue
            name = row.get("name", "")
            category = categories.get(row.get("category_slug", ""))
            if not category:
                errors.append({"row": row_number, "errors": {"category_slug": "Choose an active category slug."}})
                continue
            kind = row.get("kind", "").lower()
            if not name or kind not in Business.Kind.values:
                validation_errors = {}
                if not name:
                    validation_errors["name"] = "Business name is required."
                if kind not in Business.Kind.values:
                    validation_errors["kind"] = "Choose service, product, or both."
                errors.append({"row": row_number, "errors": validation_errors})
                continue
            subcategory_id = None
            subcategory_slug = row.get("subcategory_slug", "")
            if subcategory_slug:
                subcategory = subcategories.get((category.id, subcategory_slug))
                if not subcategory:
                    errors.append({"row": row_number, "errors": {"subcategory_slug": "Choose an active subcategory in this category."}})
                    continue
                subcategory_id = str(subcategory.id)

            explicit_slug = row.get("slug", "")
            slug = slugify(explicit_slug or name)
            if not slug:
                errors.append({"row": row_number, "errors": {"slug": "Provide a slug for this business."}})
                continue
            if explicit_slug and slug in used_slugs:
                errors.append({"row": row_number, "errors": {"slug": "This slug is already in use."}})
                continue
            if not explicit_slug:
                base_slug = slug
                suffix = 2
                while slug in used_slugs:
                    slug = f"{base_slug}-{suffix}"
                    suffix += 1
            used_slugs.add(slug)

            category_data = {}
            raw_category_data = row.get("category_data", "")
            if raw_category_data:
                try:
                    category_data = json.loads(raw_category_data)
                except ValueError:
                    errors.append({"row": row_number, "errors": {"category_data": "Use valid JSON object data."}})
                    continue
                if not isinstance(category_data, dict):
                    errors.append({"row": row_number, "errors": {"category_data": "Category data must be a JSON object."}})
                    continue

            payload = {
                "name": name,
                "slug": slug,
                "kind": kind,
                "category_id": str(category.id),
                "description": row.get("description", ""),
                "phone": row.get("phone", ""),
                "whatsapp": row.get("whatsapp", ""),
                "address": row.get("address", ""),
                "category_data": category_data,
            }
            if subcategory_id:
                payload["subcategory_id"] = subcategory_id
            serializer = BusinessSerializer(data=payload, context={"request": request})
            if serializer.is_valid():
                prepared.append((row_number, serializer))
            else:
                errors.append({"row": row_number, "errors": serializer.errors})

        if errors:
            return Response(
                {"detail": "No businesses were imported. Fix the listed CSV rows and upload again.", "errors": errors},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if not prepared:
            return Response({"detail": "The CSV contains no business rows to import."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            with transaction.atomic():
                created = []
                for row_number, serializer in prepared:
                    business = serializer.save(
                        source="field_agent",
                        verification_level=1,
                        hidden=True,
                        created_by=request.user,
                    )
                    created.append({"row": row_number, "id": str(business.id), "name": business.name})
                AuditLog.objects.create(
                    actor=request.user,
                    action="business_csv_import",
                    target_type="Business",
                    after={"created_count": len(created), "business_ids": [item["id"] for item in created]},
                )
        except IntegrityError:
            return Response(
                {"detail": "The import conflicted with an existing listing. No rows were imported; check the CSV slugs and retry."},
                status=status.HTTP_409_CONFLICT,
            )
        return Response({"created": len(created), "results": created}, status=status.HTTP_201_CREATED)


class AdminBusinessVerifyView(APIView):
    permission_classes = (IsSuperAdmin,)

    @transaction.atomic
    def post(self, request, business_id):
        business = get_object_or_404(Business.objects.select_for_update(), id=business_id, deleted_at__isnull=True)
        decision = request.data.get("decision", "verify")
        before = {"verification_level": business.verification_level, "hidden": business.hidden}
        if decision == "verify":
            business.verification_level = 2
            business.verified_by = request.user
            business.verified_on = timezone.now()
            business.hidden = False
            business.verification_note = ""
            business.approval_requested_at = None
        elif decision == "reject":
            business.hidden = True
            business.verification_note = request.data.get("note", "")
            business.approval_requested_at = None
        else:
            return Response({"detail": "Decision must be verify or reject."}, status=status.HTTP_400_BAD_REQUEST)
        business.save()
        AuditLog.objects.create(
            actor=request.user,
            action=f"business_{decision}",
            target_type="Business",
            target_id=str(business.id),
            before=before,
            after={"verification_level": business.verification_level, "hidden": business.hidden},
        )
        return Response({"id": str(business.id), "verification_level": business.verification_level, "hidden": business.hidden})


class AdminPlanRequestsView(APIView):
    permission_classes = (IsSuperAdmin,)

    def get(self, request):
        requests = SubscriptionRequest.objects.filter(
            status=SubscriptionRequest.Status.PENDING
        ).select_related("business", "requested_by")
        return Response([{
            "id": str(item.id),
            "business_id": str(item.business_id),
            "business": item.business.name,
            "requested_by": display_name(item.requested_by),
            "requested_plan": item.requested_plan,
            "created_at": item.created_at,
        } for item in requests])

    @transaction.atomic
    def post(self, request):
        plan_request = get_object_or_404(
            SubscriptionRequest.objects.select_for_update(),
            id=request.data.get("request_id"),
            status=SubscriptionRequest.Status.PENDING,
        )
        decision = request.data.get("decision")
        if decision not in ("approve", "reject"):
            return Response({"detail": "Decision must be approve or reject."}, status=status.HTTP_400_BAD_REQUEST)
        plan_request.status = (
            SubscriptionRequest.Status.APPROVED if decision == "approve"
            else SubscriptionRequest.Status.REJECTED
        )
        plan_request.reviewed_by = request.user
        plan_request.save(update_fields=("status", "reviewed_by"))
        invoice = None
        if decision == "approve":
            # The plan does not change yet: it starts when an admin records the payment for this invoice.
            from billing.services import BillingError, create_invoice

            Invoice.objects.filter(
                business=plan_request.business, status__in=(Invoice.Status.PENDING, Invoice.Status.OVERDUE),
                payment__isnull=True,
            ).update(status=Invoice.Status.CANCELLED)
            try:
                invoice, _ = create_invoice(plan_request.business, plan_request.requested_plan, timezone.localdate(), request.user)
            except BillingError as error:
                transaction.set_rollback(True)
                return Response({"detail": str(error)}, status=status.HTTP_400_BAD_REQUEST)
        AuditLog.objects.create(
            actor=request.user, action=f"plan_request_{decision}", target_type="Business",
            target_id=str(plan_request.business_id),
            after={"business": plan_request.business.name, "plan": plan_request.requested_plan},
        )
        return Response({"id": str(plan_request.id), "status": plan_request.status, "invoice": invoice.number if invoice else ""})


class AdminPlansView(APIView):
    permission_classes = (IsSuperAdmin,)

    def get(self, request):
        return Response(list(PlanPrice.objects.order_by("monthly_price").values(
            "plan", "monthly_price", "active", "max_photos", "max_active_offers"
        )))

    def put(self, request):
        plan = request.data.get("plan")
        if plan not in Business.Plan.values:
            return Response({"detail": "Choose a valid plan."}, status=status.HTTP_400_BAD_REQUEST)
        current = PlanPrice.objects.filter(plan=plan).first()
        values = {}
        for field in ("monthly_price", "max_photos", "max_active_offers"):
            value = request.data.get(field, getattr(current, field, None))
            if not isinstance(value, int) or isinstance(value, bool) or not 0 <= value <= 1_000_000:
                return Response({"detail": f"{field} must be a whole number of 0 or more."}, status=status.HTTP_400_BAD_REQUEST)
            values[field] = value
        active = request.data.get("active", getattr(current, "active", True))
        if not isinstance(active, bool):
            return Response({"detail": "active must be true or false."}, status=status.HTTP_400_BAD_REQUEST)
        before = {field: getattr(current, field, None) for field in values} if current else {}
        item, _ = PlanPrice.objects.update_or_create(plan=plan, defaults={**values, "active": active, "updated_by": request.user})
        AuditLog.objects.create(actor=request.user, action="plan_updated", target_type="PlanPrice", target_id=plan,
                                before=before, after={**values, "active": active})
        return Response({"plan": item.plan, "active": item.active, **values})


class AdminPaymentsView(APIView):
    """Payments received. To record one, use POST /api/admin/invoices/<id>/pay/."""

    permission_classes = (IsSuperAdmin,)

    def get(self, request):
        payments = Payment.objects.select_related("subscription__business").order_by("-paid_on")[:100]
        return Response([{
            "id": str(payment.id),
            "business": payment.subscription.business.name,
            "plan": payment.subscription.plan,
            "amount_paise": payment.amount_paise,
            "gst_paise": payment.gst_paise,
            "method": payment.method,
            "status": payment.status,
            "paid_on": payment.paid_on,
            "invoice": getattr(getattr(payment, "invoice", None), "number", ""),
            "gateway_ref": payment.gateway_ref,
        } for payment in payments])



def display_name(user):
    if user is None:
        return ""
    name = user.get_full_name().strip()
    return name or user.email or "Resident"


class AdminPostsView(APIView):
    """Offer moderation: list owner offers and approve or reject them."""

    permission_classes = (IsSuperAdmin,)

    def get(self, request):
        posts = BusinessPost.objects.select_related("business").order_by("-created_at")[:200]
        return Response([{
            "id": str(post.id),
            "business": post.business.name,
            "business_id": str(post.business_id),
            "title": post.title,
            "body": post.body,
            "status": post.status,
            "created_at": post.created_at,
        } for post in posts])

    def post(self, request):
        post = get_object_or_404(BusinessPost, id=request.data.get("post_id"))
        decision = request.data.get("decision")
        if decision not in (BusinessPost.Status.APPROVED, BusinessPost.Status.REJECTED):
            return Response({"detail": "Decision must be approved or rejected."}, status=status.HTTP_400_BAD_REQUEST)
        post.status = decision
        post.reviewed_by = request.user
        post.save(update_fields=("status", "reviewed_by"))
        AuditLog.objects.create(actor=request.user, action=f"offer_{decision}", target_type="BusinessPost",
                                target_id=str(post.id), after={"title": post.title, "business": post.business.name})
        return Response({"id": str(post.id), "status": post.status})


class AdminReportsView(APIView):
    permission_classes = (IsSuperAdmin,)

    def get(self, request):
        reports = Report.objects.select_related("business", "reporter").order_by("status", "-created_at")[:200]
        return Response([{
            "id": str(report.id),
            "business": report.business.name,
            "business_slug": report.business.slug,
            "reason": report.reason,
            "reporter": display_name(report.reporter),
            "status": report.status,
            "created_at": report.created_at,
        } for report in reports])

    def post(self, request):
        report = get_object_or_404(Report, id=request.data.get("report_id"))
        report.status = "resolved"
        report.resolved_by = request.user
        report.save(update_fields=("status", "resolved_by"))
        AuditLog.objects.create(actor=request.user, action="report_resolved", target_type="Report",
                                target_id=str(report.id), after={"business": report.business.name})
        return Response({"id": str(report.id), "status": report.status})


class AdminAuditView(APIView):
    permission_classes = (IsSuperAdmin,)

    def get(self, request):
        logs = AuditLog.objects.select_related("actor").order_by("-created_at")[:150]
        return Response([{
            "id": log.id,
            "actor": display_name(log.actor) or "System",
            "action": log.action,
            "target_type": log.target_type,
            "target_id": log.target_id,
            "after": log.after,
            "created_at": log.created_at,
        } for log in logs])


SETTING_DEFAULTS = {"grace_period_days": 7, "free_pro_cap": 100, "approval_sla_hours": 48}


class AdminSettingsView(APIView):
    permission_classes = (IsSuperAdmin,)

    def get(self, request):
        stored = {item.key: item.value for item in AppSetting.objects.filter(key__in=SETTING_DEFAULTS)}
        return Response({key: stored.get(key, default) for key, default in SETTING_DEFAULTS.items()})

    def put(self, request):
        updated = {}
        for key in SETTING_DEFAULTS:
            if key not in request.data:
                continue
            value = request.data[key]
            if not isinstance(value, int) or isinstance(value, bool) or not 0 <= value <= 100000:
                return Response({"detail": f"{key} must be a whole number."}, status=status.HTTP_400_BAD_REQUEST)
            AppSetting.objects.update_or_create(key=key, defaults={"value": value})
            updated[key] = value
        AuditLog.objects.create(actor=request.user, action="settings_updated", target_type="AppSetting", after=updated)
        return self.get(request)


class OwnerStatsView(APIView):
    """Views, calls and WhatsApp taps on the owner's listings in the last 30 days."""

    permission_classes = (permissions.IsAuthenticated,)

    def get(self, request):
        from django.db.models.functions import TruncDate

        kinds = ("view", "call", "whatsapp")
        now = timezone.now()
        mine = Event.objects.filter(
            business__in=Business.objects.filter(members__user=request.user).values("id"),
            type__in=kinds,
        )
        counts = dict(mine.filter(created_at__gte=now - timedelta(days=30)).values_list("type").annotate(total=Count("id")).values_list("type", "total"))
        body = {key: counts.get(key, 0) for key in kinds}

        # Daily series for the last 14 days, plus the 14 days before for trend arrows.
        today = timezone.localdate()
        start = today - timedelta(days=13)
        rows = mine.filter(created_at__date__gte=start).annotate(day=TruncDate("created_at")).values("day", "type").annotate(n=Count("id"))
        by_day = {(row["day"], row["type"]): row["n"] for row in rows}
        days = [start + timedelta(days=offset) for offset in range(14)]
        body["daily"] = [{"day": day.isoformat(), **{key: by_day.get((day, key), 0) for key in kinds}} for day in days]
        previous = dict(mine.filter(created_at__date__gte=start - timedelta(days=14), created_at__date__lt=start)
                        .values_list("type").annotate(total=Count("id")).values_list("type", "total"))
        body["last14"] = {key: sum(item[key] for item in body["daily"]) for key in kinds}
        body["prev14"] = {key: previous.get(key, 0) for key in kinds}
        return Response(body)



class OwnerHoursView(APIView):
    """Replace a listing's weekly opening hours. Body: {"hours": [{dow, opens, closes, closed}]}"""

    permission_classes = (permissions.IsAuthenticated,)

    @transaction.atomic
    def put(self, request, business_id):
        business = get_object_or_404(Business, id=business_id, deleted_at__isnull=True, members__user=request.user)
        rows = request.data.get("hours")
        if not isinstance(rows, list) or len(rows) > 7:
            return Response({"detail": "Send up to 7 days of hours."}, status=status.HTTP_400_BAD_REQUEST)
        from datetime import time as dtime
        cleaned = {}
        for row in rows:
            try:
                dow = int(row.get("dow"))
            except (TypeError, ValueError, AttributeError):
                return Response({"detail": "Each day needs a dow from 0 to 6."}, status=status.HTTP_400_BAD_REQUEST)
            if not 0 <= dow <= 6:
                return Response({"detail": "Each day needs a dow from 0 to 6."}, status=status.HTTP_400_BAD_REQUEST)
            closed = bool(row.get("closed"))
            opens = closes = None
            if not closed:
                try:
                    opens = dtime.fromisoformat(str(row.get("opens")))
                    closes = dtime.fromisoformat(str(row.get("closes")))
                except ValueError:
                    return Response({"detail": "Use HH:MM times."}, status=status.HTTP_400_BAD_REQUEST)
                if closes <= opens:
                    return Response({"detail": "Closing time must be after opening time."}, status=status.HTTP_400_BAD_REQUEST)
            cleaned[dow] = (opens, closes, closed)
        BusinessHour.objects.filter(business=business).exclude(dow__in=cleaned).delete()
        for dow, (opens, closes, closed) in cleaned.items():
            BusinessHour.objects.update_or_create(business=business, dow=dow, defaults={"opens": opens, "closes": closes, "closed": closed})
        return Response([{"dow": dow, "opens": o and o.strftime("%H:%M"), "closes": c and c.strftime("%H:%M"), "closed": cl}
                         for dow, (o, c, cl) in sorted(cleaned.items())])


class PreferencesView(APIView):
    """Per-person settings: WhatsApp alerts, dashboard theme, account type."""

    permission_classes = (permissions.IsAuthenticated,)

    @staticmethod
    def _body(profile):
        return {"whatsapp_alerts": profile.whatsapp_alerts, "theme": profile.theme, "account_type": profile.account_type}

    def get(self, request):
        profile, _ = Profile.objects.get_or_create(id=request.user)
        return Response(self._body(profile))

    def patch(self, request):
        profile, _ = Profile.objects.get_or_create(id=request.user)
        changed = []
        if "whatsapp_alerts" in request.data:
            value = request.data.get("whatsapp_alerts")
            if not isinstance(value, bool):
                return Response({"detail": "whatsapp_alerts must be true or false."}, status=status.HTTP_400_BAD_REQUEST)
            profile.whatsapp_alerts = value
            changed.append("whatsapp_alerts")
        if "theme" in request.data:
            if request.data.get("theme") not in Profile.Theme.values:
                return Response({"detail": "Choose one of the listed themes."}, status=status.HTTP_400_BAD_REQUEST)
            profile.theme = request.data["theme"]
            changed.append("theme")
        if "account_type" in request.data:
            if request.data.get("account_type") not in Profile.AccountType.values:
                return Response({"detail": "Choose resident or business owner."}, status=status.HTTP_400_BAD_REQUEST)
            profile.account_type = request.data["account_type"]
            changed.append("account_type")
        if changed:
            profile.save(update_fields=changed)
        return Response(self._body(profile))


class HealthView(APIView):
    """Uptime check: 200 when the database answers, 503 otherwise."""

    authentication_classes = ()
    permission_classes = (permissions.AllowAny,)

    def get(self, request):
        from django.db import connection
        try:
            with connection.cursor() as cursor:
                cursor.execute("SELECT 1")
                cursor.fetchone()
        except Exception:  # noqa: BLE001 - any failure means "not healthy"
            return Response({"status": "degraded", "database": "unavailable"}, status=status.HTTP_503_SERVICE_UNAVAILABLE)
        return Response({"status": "ok", "database": "ok"})
