import csv
import io
import json
import uuid
from datetime import timedelta

from django.db import IntegrityError, transaction
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.utils.text import slugify
from rest_framework import permissions, status
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.authtoken.models import Token
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.models import AdminRole
from billing.models import Invoice, Payment, PlanPrice, Subscription, SubscriptionRequest
from .models import AuditLog, Business, BusinessMember, BusinessPost, Category, Claim, Subcategory
from .permissions import IsSuperAdmin
from .serializers import BusinessPostSerializer, BusinessSerializer


class CurrentUserView(APIView):
    permission_classes = (permissions.IsAuthenticated,)

    def get(self, request):
        return Response({
            "id": str(request.user.id),
            "username": request.user.username,
            "mobile": request.user.mobile,
            "is_superadmin": request.user.admin_roles.filter(
                role=AdminRole.Role.SUPER_ADMIN
            ).exists(),
        })


class LogoutView(APIView):
    permission_classes = (permissions.IsAuthenticated,)

    def post(self, request):
        Token.objects.filter(user=request.user).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class OwnerBusinessesView(APIView):
    permission_classes = (permissions.IsAuthenticated,)

    def get(self, request):
        businesses = Business.objects.filter(
            members__user=request.user, deleted_at__isnull=True
        ).distinct()
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
        claim = Claim.objects.create(
            business=business,
            user=request.user,
            proof_path=request.data.get("proof_path", ""),
        )
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
        serializer = BusinessPostSerializer(data={
            **request.data,
            "business": str(business.id),
        })
        serializer.is_valid(raise_exception=True)
        post = serializer.save(status=BusinessPost.Status.PENDING)
        return Response(BusinessPostSerializer(post).data, status=status.HTTP_201_CREATED)


class OwnerPlansView(APIView):
    permission_classes = (permissions.IsAuthenticated,)

    def get(self, request):
        businesses = Business.objects.filter(members__user=request.user).distinct()
        prices = list(PlanPrice.objects.filter(active=True).values("plan", "monthly_price"))
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
        plan_request = SubscriptionRequest.objects.create(
            business=business, requested_plan=plan, requested_by=request.user
        )
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
        })


class AdminClaimsView(APIView):
    permission_classes = (IsSuperAdmin,)

    def get(self, request):
        claims = Claim.objects.filter(status=Claim.Status.PENDING).select_related("business", "user")
        return Response([{
            "id": str(claim.id),
            "business_id": str(claim.business_id),
            "business": claim.business.name,
            "user": claim.user.username,
            "proof_path": claim.proof_path,
            "created_at": claim.created_at,
        } for claim in claims])

    def post(self, request):
        claim = get_object_or_404(Claim, id=request.data.get("claim_id"), status=Claim.Status.PENDING)
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
            claim.business.verification_level = max(claim.business.verification_level, 1)
            claim.business.save(update_fields=("verification_level", "updated_at"))
        return Response({"id": str(claim.id), "status": claim.status})


class AdminBusinessesView(APIView):
    permission_classes = (IsSuperAdmin,)

    def get(self, request):
        businesses = Business.objects.filter(deleted_at__isnull=True).select_related("category")
        return Response(BusinessSerializer(businesses, many=True, context={"request": request}).data)

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

    def post(self, request, business_id):
        business = get_object_or_404(Business, id=business_id, deleted_at__isnull=True)
        decision = request.data.get("decision", "verify")
        before = {"verification_level": business.verification_level, "hidden": business.hidden}
        if decision == "verify":
            business.verification_level = 2
            business.verified_by = request.user
            business.verified_on = timezone.now()
            business.hidden = False
        elif decision == "reject":
            business.hidden = True
            business.verification_note = request.data.get("note", "")
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
            "requested_by": item.requested_by.username,
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
        if decision == "approve":
            Subscription.objects.create(
                business=plan_request.business,
                plan=plan_request.requested_plan,
                status=Subscription.Status.TRIAL,
                trial=True,
                starts_on=timezone.now(),
                created_by=request.user,
            )
            plan_request.business.plan = plan_request.requested_plan
            plan_request.business.save(update_fields=("plan", "updated_at"))
        return Response({"id": str(plan_request.id), "status": plan_request.status})


class AdminPlansView(APIView):
    permission_classes = (IsSuperAdmin,)

    def get(self, request):
        return Response(list(PlanPrice.objects.order_by("monthly_price").values("plan", "monthly_price", "active")))

    def put(self, request):
        plan = request.data.get("plan")
        price = request.data.get("monthly_price")
        if plan not in Business.Plan.values or not isinstance(price, int) or isinstance(price, bool) or price < 0:
            return Response({"detail": "Provide a valid plan and non-negative monthly price."}, status=status.HTTP_400_BAD_REQUEST)
        item, _ = PlanPrice.objects.update_or_create(
            plan=plan,
            defaults={
                "monthly_price": price,
                "active": request.data.get("active", True),
                "updated_by": request.user,
            },
        )
        return Response({"plan": item.plan, "monthly_price": item.monthly_price, "active": item.active})


class AdminPaymentsView(APIView):
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
        } for payment in payments])

    @transaction.atomic
    def post(self, request):
        business = get_object_or_404(Business, id=request.data.get("business_id"))
        plan = request.data.get("plan")
        amount = request.data.get("amount_paise")
        gst = request.data.get("gst_paise", 0)
        method = request.data.get("method", "manual")
        if plan not in Business.Plan.values or not isinstance(amount, int) or isinstance(amount, bool) or amount < 0:
            return Response({"detail": "Provide a valid plan and non-negative amount in paise."}, status=status.HTTP_400_BAD_REQUEST)
        if not isinstance(gst, int) or isinstance(gst, bool) or gst < 0:
            return Response({"detail": "GST must be a non-negative amount in paise."}, status=status.HTTP_400_BAD_REQUEST)
        if not isinstance(method, str) or not method.strip():
            return Response({"detail": "Payment method is required."}, status=status.HTTP_400_BAD_REQUEST)
        now = timezone.now()
        subscription = Subscription.objects.create(
            business=business,
            plan=plan,
            status=Subscription.Status.ACTIVE,
            starts_on=now,
            expires_on=now + timedelta(days=30),
            created_by=request.user,
        )
        payment = Payment.objects.create(
            subscription=subscription,
            amount_paise=amount,
            gst_paise=gst,
            method=method.strip(),
            gateway_ref=request.data.get("gateway_ref") or f"manual-{uuid.uuid4()}",
            status="paid",
            paid_on=now,
            recorded_by=request.user,
        )
        Invoice.objects.create(
            payment=payment,
            number=f"MS-{uuid.uuid4().hex[:12].upper()}",
            issued_on=timezone.localdate(now),
        )
        business.plan = plan
        business.plan_expires_on = subscription.expires_on
        business.save(update_fields=("plan", "plan_expires_on", "updated_at"))
        AuditLog.objects.create(
            actor=request.user,
            action="payment_recorded",
            target_type="Payment",
            target_id=str(payment.id),
            after={"business": business.name, "plan": plan, "amount_paise": amount, "status": payment.status},
        )
        return Response({"id": str(payment.id), "status": payment.status, "subscription_id": str(subscription.id)}, status=status.HTTP_201_CREATED)
