"""A small, dependency-free PDF writer for MySobo tax invoices.

The standard Helvetica font has no rupee sign, so amounts use "Rs.".
Text is limited to Latin-1; anything else is replaced with "?".
"""

BRAND = (0.157, 0.478, 0.294)  # Leaf Green #287A4B
MINT = (0.918, 0.973, 0.929)   # #EAF8ED
INK = (0.102, 0.137, 0.110)    # #1A231C
MUTED = (0.290, 0.329, 0.298)  # #4A544C


def _text(value):
    value = str(value).encode("latin-1", "replace").decode("latin-1")
    return value.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")


def rupees(paise):
    whole, part = divmod(int(paise), 100)
    digits = str(whole)
    # Indian grouping: 1,23,456
    if len(digits) > 3:
        head, tail = digits[:-3], digits[-3:]
        groups = []
        while len(head) > 2:
            groups.insert(0, head[-2:])
            head = head[:-2]
        if head:
            groups.insert(0, head)
        digits = ",".join(groups + [tail])
    return f"Rs. {digits}.{part:02d}"


class _Page:
    def __init__(self):
        self.ops = []

    def color(self, rgb, stroke=False):
        self.ops.append("%.3f %.3f %.3f %s" % (*rgb, "RG" if stroke else "rg"))

    def text(self, x, y, value, size=10, bold=False, rgb=INK, right=False):
        if right:
            # Rough Helvetica width: 0.5 em per character is close enough for right alignment of numbers.
            x -= len(str(value)) * size * 0.52
        self.color(rgb)
        self.ops.append(f"BT /{'F2' if bold else 'F1'} {size} Tf {x:.1f} {y:.1f} Td ({_text(value)}) Tj ET")

    def rect(self, x, y, w, h, rgb):
        self.color(rgb)
        self.ops.append(f"{x:.1f} {y:.1f} {w:.1f} {h:.1f} re f")

    def line(self, x1, y1, x2, y2, rgb=MUTED, width=0.6):
        self.color(rgb, stroke=True)
        self.ops.append(f"{width} w {x1:.1f} {y1:.1f} m {x2:.1f} {y2:.1f} l S")


def _build(content):
    objects = [
        "<< /Type /Catalog /Pages 2 0 R >>",
        "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R "
        "/Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> >>",
        f"<< /Length {len(content)} >>\nstream\n{content}\nendstream",
        "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
        "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>",
    ]
    out = bytearray(b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\n")
    offsets = []
    for number, body in enumerate(objects, start=1):
        offsets.append(len(out))
        out += f"{number} 0 obj\n{body}\nendobj\n".encode("latin-1")
    xref = len(out)
    out += f"xref\n0 {len(objects) + 1}\n0000000000 65535 f \n".encode("latin-1")
    for offset in offsets:
        out += f"{offset:010d} 00000 n \n".encode("latin-1")
    out += f"trailer\n<< /Size {len(objects) + 1} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF\n".encode("latin-1")
    return bytes(out)


def invoice_pdf(invoice):
    from django.conf import settings

    seller = getattr(settings, "INVOICE_SELLER_NAME", "MySobo")
    seller_address = getattr(settings, "INVOICE_SELLER_ADDRESS", "")
    seller_gstin = getattr(settings, "INVOICE_SELLER_GSTIN", "")
    page = _Page()
    left, right = 50, 545
    page.rect(0, 792, 595, 50, BRAND)
    page.text(left, 810, "MySobo", size=22, bold=True, rgb=(1, 1, 1))
    page.text(right, 812, "TAX INVOICE" if seller_gstin else "INVOICE", size=12, bold=True, rgb=(1, 1, 1), right=True)
    page.text(right, 770, seller, size=9, bold=True, right=True)
    if seller_address:
        page.text(right, 758, seller_address[:70], size=8, rgb=MUTED, right=True)
    if seller_gstin:
        page.text(right, 746, f"GSTIN: {seller_gstin}", size=8, rgb=MUTED, right=True)

    y = 760
    page.text(left, y, f"Invoice {invoice.number}", size=14, bold=True)
    status = invoice.get_status_display().upper()
    page.text(right, 722, status, size=11, bold=True, rgb=BRAND if invoice.status == "paid" else MUTED, right=True)
    y -= 18
    for label, value in (
        ("Issued", invoice.issued_on.strftime("%d %b %Y")),
        ("Due", invoice.due_on.strftime("%d %b %Y")),
        ("Billing period", f"{invoice.period_start.strftime('%d %b %Y')} to {invoice.period_end.strftime('%d %b %Y')}"),
    ):
        page.text(left, y, f"{label}:", size=10, rgb=MUTED)
        page.text(left + 90, y, value, size=10)
        y -= 15
    if invoice.paid_on:
        page.text(left, y, "Paid on:", size=10, rgb=MUTED)
        page.text(left + 90, y, invoice.paid_on.strftime("%d %b %Y"), size=10)
        y -= 15

    y -= 12
    page.text(left, y, "Billed to", size=10, bold=True, rgb=BRAND)
    y -= 15
    page.text(left, y, invoice.business_name, size=11, bold=True)
    y -= 14
    for value in (invoice.business_address, invoice.business_phone, invoice.business_email):
        if value:
            page.text(left, y, value[:90], size=10, rgb=MUTED)
            y -= 14
    if invoice.business_gst:
        page.text(left, y, f"GSTIN: {invoice.business_gst}", size=10, rgb=MUTED)
        y -= 14

    y -= 18
    page.rect(left, y - 6, right - left, 22, MINT)
    page.text(left + 8, y, "Description", size=10, bold=True)
    page.text(right - 8, y, "Amount", size=10, bold=True, right=True)
    y -= 26
    page.text(left + 8, y, f"MySobo {invoice.get_plan_display()} plan, 1 month", size=10)
    page.text(right - 8, y, rupees(invoice.amount_paise), size=10, right=True)
    y -= 18
    page.text(left + 8, y, f"GST @ {invoice.gst_percent}%", size=10)
    page.text(right - 8, y, rupees(invoice.gst_paise), size=10, right=True)
    y -= 12
    page.line(left, y, right, y, BRAND, 1.2)
    y -= 18
    page.text(left + 8, y, "Total", size=12, bold=True)
    page.text(right - 8, y, rupees(invoice.total_paise), size=12, bold=True, right=True)

    y -= 40
    page.text(left, y, "Pay by UPI or cash to the MySobo team. Paid features start once your payment is recorded.", size=9, rgb=MUTED)
    page.text(left, 40, f"{seller} - {seller_address}" if seller_address else seller, size=8, rgb=MUTED)
    return _build("\n".join(page.ops))
