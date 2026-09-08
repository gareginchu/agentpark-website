"""One-off payment report generator for the Design Thinking Bootcamp event."""

from pathlib import Path
from openpyxl import Workbook
from openpyxl.styles import Font, Alignment, PatternFill, Border, Side
from openpyxl.utils import get_column_letter
from docx import Document
from docx.shared import Pt, Cm, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH


EVENT = {
    "id": "ac3cc99a-75f5-49fd-8111-9195b057fd46",
    "title_en": "Design Thinking Bootcamp & Coach Certification",
    "title_am": "Design Thinking բութքեմփ և մարզչի սերտիֆիկացում",
    "dates": "June 18-24, 2026",
    "location": "Yerevan and Hankavan",
    "currency": "AMD",
}

COACH_TIER_PRICE = 215000

COACH_REGISTRATIONS = [
    ("Narina Hovhannisyan",  "narina.hovhannisyan@gmail.com",   "+37491227565", "2026-06-16 17:01:33"),
    ("Yelena Kolupaeva",     "llena.kolupaeva@gmail.com",       "+37455334656", "2026-06-16 20:35:12"),
    ("Hrak Haytayan",        "hrakhaytayan@gmail.com",          "+37495500488", "2026-06-17 08:29:26"),
    ("Artashes Kradjian",    "artashes.kradjian@axellect.com",  "+971506982936", "2026-06-18 07:33:45"),
    ("Sargis Baghramyan",    "ksenia.ganina@axenix.pro",        "+37441046943", "2026-06-18 07:55:18"),
    ("Arpen Tadevosyan",     "ksenia.ganina@axenix.pro",        "+37455381891", "2026-06-18 07:59:19"),
    ("Milena Movsesyan",     "ksenia.ganina@axenix.pro",        "+37499411001", "2026-06-18 08:01:59"),
]

SCHOLARSHIP_REGISTRATIONS = [
    ("Zhasmin Hovhannisyan", "jas.hovhannisyan@gmail.com",    "+37455527646", 6400,   "HackNation Global AI Hackathon participant from Yerevan", "2026-06-10 13:56:39"),
    ("Vardan Arakelyan",     "vardan.g.arakelyan@gmail.com",  "+37444455545", 6400,   "HackNation Global AI Hackathon",                          "2026-06-12 09:25:13"),
    ("Fedor Shoshin",        "jedi.f.sh@gmail.com",           "+37494771829", 6400,   "HackNation Global AI Hackathon",                          "2026-06-13 07:57:55"),
    ("Lilit Mikaelyan",      "lilit.miqaelyan@edu.ysu.am",    "+37499484375", 6400,   "HackNation Global AI Hackathon Local Winner",             "2026-06-13 08:40:41"),
    ("Meri Grigoryan",       "merigrigoryan576@gmail.com",    "+37491610181", 50000,  "HackNation Global AI Hackathon",                          "2026-06-13 10:11:57"),
    ("Davit Vanyan",         "david.vanyan1@gmail.com",       "+37498050672", 6400,   "HackNation Global AI Hackathon",                          "2026-06-13 11:11:59"),
    ("Levon Khachatryan",    "khlevonn@gmail.com",            "+37495513135", 60000,  "HackNation Global AI Hackathon, Yerevan Hub winner",       "2026-06-13 13:04:29"),
    ("Ani Samsonyan",        "samsonyanani1331@gmail.com",    "+37494628767", 70000,  "Armenian Code Academy SAP course",                        "2026-06-13 17:11:19"),
    ("Arpen Tadevosyan",     "arpentadevosyan@gmail.com",     "+37455381891", 6400,   "HackNation Global AI Hackathon",                          "2026-06-14 05:17:12"),
    ("Lusine Ghazaryan",     "lusine_ghazaryan@yahoo.com",    "+37455252562", 50000,  "ACA training participant",                                "2026-06-16 06:13:11"),
    ("Vache Avagyan",        "awagyan.wache@gmail.com",       "+37455252592", 6400,   "HackNation Global AI Hackathon",                          "2026-06-16 06:22:34"),
    ("Anna Avanesyan",       "anna.avanesyan@yahoo.com",      "+37495771272", 60000,  "ACA Training Graduate",                                    "2026-06-16 07:35:24"),
    ("Ricardo Bergmann",     "ricardodbergmann@gmail.com",    "+37494100879", 149900, "SAP Training Participant",                                "2026-06-16 19:52:24"),
    ("Maria",                "maria.sahakyan2.y@tumo.org",    "+37455524600", 6400,   "HackNation Global AI Hackathon",                          "2026-06-16 20:33:41"),
    ("Mane Minasyan",        "minasyanmaneh@gmail.com",       "+37494782575", 50000,  "Organizing team member",                                  "2026-06-17 11:13:10"),
]

ANOMALIES = [
    ("Arpen Tadevosyan registered twice",
     "First as scholarship (6,400 AMD, HackNation) on June 14, then again as full Coach Certification (215,000 AMD) on June 18. Likely a legitimate upgrade; confirm they attended the coach track."),
    ("Three coach registrations share the same email",
     "ksenia.ganina@axenix.pro was used to pay for Sargis Baghramyan, Arpen Tadevosyan, and Milena Movsesyan within 6 minutes on June 18. Looks like a corporate bulk purchase from Axenix. Email correspondence should go to Ksenia's address; attendance tracked under individual names."),
    ("All confirmation emails delivered",
     "email_sent = true for all 22 paid registrations."),
    ("Failed / pending payments",
     "8 declined attempts (would have been 468,400 AMD) and 2 pending (179,000 AMD) are not included in the paid total."),
]

COACH_TOTAL = COACH_TIER_PRICE * len(COACH_REGISTRATIONS)
SCHOLARSHIP_TOTAL = sum(r[3] for r in SCHOLARSHIP_REGISTRATIONS)
GRAND_TOTAL = COACH_TOTAL + SCHOLARSHIP_TOTAL


# ---------------- Excel ----------------

def build_xlsx(out_path: Path) -> None:
    wb = Workbook()

    header_font = Font(bold=True, color="FFFFFF")
    header_fill = PatternFill("solid", fgColor="1F4E78")
    section_font = Font(bold=True, size=13)
    money_font = Font(bold=True)
    thin = Side(border_style="thin", color="CCCCCC")
    border = Border(left=thin, right=thin, top=thin, bottom=thin)

    def style_header_row(ws, row_idx, ncols):
        for c in range(1, ncols + 1):
            cell = ws.cell(row=row_idx, column=c)
            cell.font = header_font
            cell.fill = header_fill
            cell.alignment = Alignment(horizontal="left", vertical="center")
            cell.border = border

    def autosize(ws):
        for col in ws.columns:
            length = max((len(str(c.value)) if c.value is not None else 0) for c in col)
            ws.column_dimensions[get_column_letter(col[0].column)].width = min(max(length + 2, 12), 55)

    # ---------- Summary sheet ----------
    ws = wb.active
    ws.title = "Summary"

    ws["A1"] = "Payment Report — Design Thinking Bootcamp & Coach Certification"
    ws["A1"].font = Font(bold=True, size=16)
    ws.merge_cells("A1:D1")

    ws["A3"] = "Event"
    ws["B3"] = EVENT["title_en"]
    ws["A4"] = "Dates"
    ws["B4"] = EVENT["dates"]
    ws["A5"] = "Location"
    ws["B5"] = EVENT["location"]
    ws["A6"] = "Event ID"
    ws["B6"] = EVENT["id"]
    ws["A7"] = "Currency"
    ws["B7"] = EVENT["currency"]
    for r in range(3, 8):
        ws.cell(row=r, column=1).font = Font(bold=True)

    ws["A9"] = "Headline"
    ws["A9"].font = section_font
    ws["A10"] = "Metric"
    ws["B10"] = "Value"
    style_header_row(ws, 10, 2)

    headline = [
        ("Paid registrations", 22),
        ("Total revenue (AMD)", GRAND_TOTAL),
        ("Declined attempts", 8),
        ("Would-be revenue if declined had succeeded (AMD)", 468400),
        ("Pending registrations", 2),
        ("Pending amount (AMD)", 179000),
    ]
    for i, (k, v) in enumerate(headline, start=11):
        ws.cell(row=i, column=1, value=k)
        c = ws.cell(row=i, column=2, value=v)
        if isinstance(v, int) and "AMD" in k:
            c.number_format = "#,##0"
            c.font = money_font

    ws["A19"] = "Revenue by tier"
    ws["A19"].font = section_font
    ws["A20"] = "Tier"
    ws["B20"] = "Registrations"
    ws["C20"] = "Per person (AMD)"
    ws["D20"] = "Subtotal (AMD)"
    ws["E20"] = "% of revenue"
    style_header_row(ws, 20, 5)

    tier_rows = [
        ("Coach Certification", len(COACH_REGISTRATIONS), COACH_TIER_PRICE, COACH_TOTAL, COACH_TOTAL / GRAND_TOTAL),
        ("Scholarship (custom amounts)", len(SCHOLARSHIP_REGISTRATIONS), None, SCHOLARSHIP_TOTAL, SCHOLARSHIP_TOTAL / GRAND_TOTAL),
    ]
    for i, (tier, count, per, subtotal, pct) in enumerate(tier_rows, start=21):
        ws.cell(row=i, column=1, value=tier)
        ws.cell(row=i, column=2, value=count)
        c3 = ws.cell(row=i, column=3, value=per if per is not None else "varies")
        if per is not None:
            c3.number_format = "#,##0"
        c4 = ws.cell(row=i, column=4, value=subtotal)
        c4.number_format = "#,##0"
        c5 = ws.cell(row=i, column=5, value=pct)
        c5.number_format = "0.0%"

    ws.cell(row=23, column=1, value="TOTAL").font = Font(bold=True)
    ws.cell(row=23, column=2, value=22).font = Font(bold=True)
    total_cell = ws.cell(row=23, column=4, value=GRAND_TOTAL)
    total_cell.number_format = "#,##0"
    total_cell.font = Font(bold=True)
    ws.cell(row=23, column=5, value=1.0).number_format = "0.0%"

    autosize(ws)

    # ---------- Coach sheet ----------
    ws2 = wb.create_sheet("Coach Certification")
    headers = ["#", "Name", "Email", "Phone", "Amount (AMD)", "Paid at (UTC)"]
    ws2.append(headers)
    style_header_row(ws2, 1, len(headers))
    for i, (name, email, phone, paid_at) in enumerate(COACH_REGISTRATIONS, start=1):
        ws2.append([i, name, email, phone, COACH_TIER_PRICE, paid_at])
        ws2.cell(row=i + 1, column=5).number_format = "#,##0"
    ws2.append([])
    total_row = ws2.max_row + 1
    ws2.cell(row=total_row, column=4, value="Total").font = Font(bold=True)
    tc = ws2.cell(row=total_row, column=5, value=COACH_TOTAL)
    tc.number_format = "#,##0"
    tc.font = Font(bold=True)
    autosize(ws2)

    # ---------- Scholarship sheet ----------
    ws3 = wb.create_sheet("Scholarships")
    headers = ["#", "Name", "Email", "Phone", "Amount (AMD)", "Scholarship", "Paid at (UTC)"]
    ws3.append(headers)
    style_header_row(ws3, 1, len(headers))
    for i, (name, email, phone, amount, scholarship, paid_at) in enumerate(SCHOLARSHIP_REGISTRATIONS, start=1):
        ws3.append([i, name, email, phone, amount, scholarship, paid_at])
        ws3.cell(row=i + 1, column=5).number_format = "#,##0"
    ws3.append([])
    total_row = ws3.max_row + 1
    ws3.cell(row=total_row, column=4, value="Total").font = Font(bold=True)
    tc = ws3.cell(row=total_row, column=5, value=SCHOLARSHIP_TOTAL)
    tc.number_format = "#,##0"
    tc.font = Font(bold=True)
    autosize(ws3)

    # ---------- All registrations sheet ----------
    ws4 = wb.create_sheet("All Registrations")
    headers = ["#", "Name", "Email", "Phone", "Tier", "Amount (AMD)", "Scholarship", "Paid at (UTC)"]
    ws4.append(headers)
    style_header_row(ws4, 1, len(headers))
    idx = 0
    combined = []
    for name, email, phone, paid_at in COACH_REGISTRATIONS:
        combined.append((paid_at, name, email, phone, "coach", COACH_TIER_PRICE, ""))
    for name, email, phone, amount, scholarship, paid_at in SCHOLARSHIP_REGISTRATIONS:
        combined.append((paid_at, name, email, phone, "scholarship", amount, scholarship))
    combined.sort(key=lambda r: r[0])
    for paid_at, name, email, phone, tier, amount, scholarship in combined:
        idx += 1
        ws4.append([idx, name, email, phone, tier, amount, scholarship, paid_at])
        ws4.cell(row=idx + 1, column=6).number_format = "#,##0"
    ws4.append([])
    total_row = ws4.max_row + 1
    ws4.cell(row=total_row, column=5, value="Total").font = Font(bold=True)
    tc = ws4.cell(row=total_row, column=6, value=GRAND_TOTAL)
    tc.number_format = "#,##0"
    tc.font = Font(bold=True)
    autosize(ws4)

    # ---------- Anomalies sheet ----------
    ws5 = wb.create_sheet("Anomalies & Notes")
    ws5.append(["Item", "Detail"])
    style_header_row(ws5, 1, 2)
    for item, detail in ANOMALIES:
        ws5.append([item, detail])
        ws5.cell(row=ws5.max_row, column=2).alignment = Alignment(wrap_text=True, vertical="top")
    ws5.column_dimensions["A"].width = 40
    ws5.column_dimensions["B"].width = 90

    wb.save(out_path)


# ---------------- Word ----------------

def add_table(doc, headers, rows, widths_cm=None):
    table = doc.add_table(rows=1 + len(rows), cols=len(headers))
    table.style = "Light Grid Accent 1"
    hdr = table.rows[0].cells
    for i, h in enumerate(headers):
        hdr[i].text = h
        for p in hdr[i].paragraphs:
            for run in p.runs:
                run.bold = True
    for r_i, row in enumerate(rows, start=1):
        for c_i, val in enumerate(row):
            table.rows[r_i].cells[c_i].text = str(val)
    if widths_cm:
        for row in table.rows:
            for c, w in zip(row.cells, widths_cm):
                c.width = Cm(w)
    return table


def build_docx(out_path: Path) -> None:
    doc = Document()

    style = doc.styles["Normal"]
    style.font.name = "Calibri"
    style.font.size = Pt(11)

    title = doc.add_heading("Payment Report — Design Thinking Bootcamp & Coach Certification", level=0)
    title.alignment = WD_ALIGN_PARAGRAPH.LEFT

    p = doc.add_paragraph()
    p.add_run(f"Event: ").bold = True
    p.add_run(f"{EVENT['title_en']}\n")
    p.add_run(f"Dates: ").bold = True
    p.add_run(f"{EVENT['dates']}\n")
    p.add_run(f"Location: ").bold = True
    p.add_run(f"{EVENT['location']}\n")
    p.add_run(f"Event ID: ").bold = True
    p.add_run(f"{EVENT['id']}\n")
    p.add_run(f"Currency: ").bold = True
    p.add_run(f"{EVENT['currency']}")

    doc.add_heading("Headline numbers", level=1)
    add_table(doc,
              ["Metric", "Value"],
              [
                  ("Paid registrations", "22"),
                  ("Total revenue", f"{GRAND_TOTAL:,} AMD"),
                  ("Declined attempts", "8"),
                  ("Would-be revenue if declined had succeeded", "468,400 AMD"),
                  ("Pending registrations", "2"),
                  ("Pending amount", "179,000 AMD"),
              ],
              widths_cm=[8, 6])

    doc.add_heading("Revenue breakdown by ticket tier", level=1)
    add_table(doc,
              ["Tier", "Registrations", "Per person", "Subtotal", "% of revenue"],
              [
                  ("Coach Certification", len(COACH_REGISTRATIONS), f"{COACH_TIER_PRICE:,} AMD", f"{COACH_TOTAL:,} AMD", f"{COACH_TOTAL / GRAND_TOTAL:.1%}"),
                  ("Scholarship (custom amounts)", len(SCHOLARSHIP_REGISTRATIONS), "varies", f"{SCHOLARSHIP_TOTAL:,} AMD", f"{SCHOLARSHIP_TOTAL / GRAND_TOTAL:.1%}"),
                  ("Total", 22, "—", f"{GRAND_TOTAL:,} AMD", "100.0%"),
              ],
              widths_cm=[5.5, 2.5, 3.5, 3.5, 2.5])

    doc.add_heading(f"Coach Certification tier — {COACH_TIER_PRICE:,} AMD each", level=1)
    add_table(doc,
              ["#", "Name", "Email", "Phone", "Paid at (UTC)"],
              [(i, name, email, phone, paid_at)
               for i, (name, email, phone, paid_at) in enumerate(COACH_REGISTRATIONS, start=1)],
              widths_cm=[0.8, 3.5, 4.5, 3.0, 3.5])
    p = doc.add_paragraph()
    r = p.add_run(f"Coach subtotal: {COACH_TOTAL:,} AMD")
    r.bold = True

    doc.add_heading("Scholarship tier — custom amounts", level=1)
    add_table(doc,
              ["#", "Name", "Amount (AMD)", "Scholarship", "Paid at (UTC)"],
              [(i, name, f"{amount:,}", scholarship, paid_at)
               for i, (name, email, phone, amount, scholarship, paid_at) in enumerate(SCHOLARSHIP_REGISTRATIONS, start=1)],
              widths_cm=[0.8, 3.5, 2.2, 5.5, 3.5])
    p = doc.add_paragraph()
    r = p.add_run(f"Scholarship subtotal: {SCHOLARSHIP_TOTAL:,} AMD")
    r.bold = True

    doc.add_heading("Anomalies & notes", level=1)
    for title, detail in ANOMALIES:
        p = doc.add_paragraph(style="List Bullet")
        r = p.add_run(f"{title}. ")
        r.bold = True
        p.add_run(detail)

    doc.save(out_path)


def main():
    project_root = Path(__file__).resolve().parent
    reports_dir = project_root / "reports"
    reports_dir.mkdir(exist_ok=True)

    slug = "design-thinking-bootcamp-2026-06-18"
    xlsx_path = reports_dir / f"payment-report_{slug}.xlsx"
    docx_path = reports_dir / f"payment-report_{slug}.docx"

    build_xlsx(xlsx_path)
    build_docx(docx_path)

    print("XLSX:", xlsx_path)
    print("DOCX:", docx_path)


if __name__ == "__main__":
    main()
