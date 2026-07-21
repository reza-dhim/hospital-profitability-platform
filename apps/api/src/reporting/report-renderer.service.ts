import { Injectable } from "@nestjs/common";
import ExcelJS from "exceljs";
import type { DoctorAnalyticsData, ExecutiveSummaryData, ProfitabilityDetailData } from "./report-data.service";

/**
 * `puppeteer` is ESM-only (`"type": "module"`, no CJS `require` fallback —
 * checked its package.json directly). A plain `await import("puppeteer")`
 * compiles fine for the real app (ts-node/webpack under `nest start`,
 * verified manually against the live dev server), but ts-jest's
 * CommonJS-targeted output statically rewrites `import()` into `require()`,
 * which then fails to load an ESM-only package. Routing the specifier
 * through `new Function(...)` hides the call from TypeScript's static
 * rewriting, so it stays a genuine native dynamic `import()` at runtime —
 * the standard workaround for this exact ts-jest + ESM-only-dependency
 * interaction.
 */
const dynamicImport = new Function("specifier", "return import(specifier)") as (specifier: string) => Promise<typeof import("puppeteer")>;

const CURRENCY_FORMATTER = new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 });

function money(value: string): string {
  return CURRENCY_FORMATTER.format(Number(value));
}

function percent(value: string | null): string {
  return value === null ? "—" : `${Number(value).toFixed(1)}%`;
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

const PDF_BASE_STYLE = `
  body { font-family: Helvetica, Arial, sans-serif; color: #1a1a1a; font-size: 12px; margin: 32px; }
  h1 { font-size: 20px; margin-bottom: 4px; }
  h2 { font-size: 15px; margin-top: 24px; border-bottom: 1px solid #ddd; padding-bottom: 4px; }
  .meta { color: #666; font-size: 11px; margin-bottom: 16px; }
  .kpi-row { display: flex; gap: 16px; margin: 16px 0; }
  .kpi { flex: 1; border: 1px solid #ddd; border-radius: 4px; padding: 10px; }
  .kpi .label { font-size: 10px; color: #666; }
  .kpi .value { font-size: 16px; font-weight: bold; }
  table { width: 100%; border-collapse: collapse; margin-top: 8px; }
  th, td { text-align: left; padding: 4px 8px; border-bottom: 1px solid #eee; font-size: 11px; }
  th { background: #f3f4f6; }
  td.num, th.num { text-align: right; }
  .negative { color: #b91c1c; }
  .positive { color: #15803d; }
`;

/**
 * PDF: server-side HTML/CSS rendered by a headless browser (`page.pdf()`),
 * not a screenshot of the live UI (docs/15_REPORTING.md §5) — confirmed
 * launching cleanly in this sandbox before building on it. Excel: `exceljs`,
 * the same library `TemplateService` already uses for upload templates —
 * values are pre-computed server-side, no in-cell formulas
 * (docs/15_REPORTING.md §5: "avoid exposing calculation logic").
 */
@Injectable()
export class ReportRendererService {
  async renderExecutiveSummaryPdf(data: ExecutiveSummaryData): Promise<Buffer> {
    const marginClass = (value: string | null) => (value !== null && Number(value) < 0 ? "negative" : "positive");
    const html = `
      <html><head><style>${PDF_BASE_STYLE}</style></head><body>
        <h1>Executive Summary — ${escapeHtml(data.hospitalName)}</h1>
        <div class="meta">Periode ${escapeHtml(data.periodLabel)} · Allocation run ${data.allocationRunId} · Dibuat ${data.generatedAt.toISOString()}</div>

        <div class="kpi-row">
          <div class="kpi"><div class="label">Total Pendapatan</div><div class="value">${money(data.totalRevenue)}</div></div>
          <div class="kpi"><div class="label">Total Biaya</div><div class="value">${money(data.totalCost)}</div></div>
          <div class="kpi"><div class="label">Laba Kotor</div><div class="value">${money(data.totalGrossProfit)}</div></div>
          <div class="kpi"><div class="label">Margin Keseluruhan</div><div class="value">${percent(data.overallMargin)}</div></div>
        </div>

        <h2>Tren Pendapatan &amp; Biaya per Periode</h2>
        <table>
          <thead><tr><th>Periode</th><th class="num">Pendapatan</th><th class="num">Biaya</th><th class="num">Margin</th></tr></thead>
          <tbody>
            ${data.trend
              .map(
                (p) =>
                  `<tr><td>${escapeHtml(p.periodLabel)}</td><td class="num">${money(p.revenue)}</td><td class="num">${money(p.cost)}</td><td class="num">${percent(p.margin)}</td></tr>`
              )
              .join("")}
          </tbody>
        </table>

        <h2>Top 5 Profit Center (Margin)</h2>
        <table>
          <thead><tr><th>Kode</th><th>Nama</th><th class="num">Pendapatan</th><th class="num">Laba Kotor</th><th class="num">Margin</th></tr></thead>
          <tbody>
            ${data.topProfitCenters
              .map(
                (pc) =>
                  `<tr><td>${escapeHtml(pc.profitCenterCode)}</td><td>${escapeHtml(pc.profitCenterName)}</td><td class="num">${money(pc.revenue)}</td><td class="num">${money(pc.grossProfit)}</td><td class="num ${marginClass(pc.margin)}">${percent(pc.margin)}</td></tr>`
              )
              .join("")}
          </tbody>
        </table>

        <h2>Bottom 5 Profit Center (Margin)</h2>
        <table>
          <thead><tr><th>Kode</th><th>Nama</th><th class="num">Pendapatan</th><th class="num">Laba Kotor</th><th class="num">Margin</th></tr></thead>
          <tbody>
            ${data.bottomProfitCenters
              .map(
                (pc) =>
                  `<tr><td>${escapeHtml(pc.profitCenterCode)}</td><td>${escapeHtml(pc.profitCenterName)}</td><td class="num">${money(pc.revenue)}</td><td class="num">${money(pc.grossProfit)}</td><td class="num ${marginClass(pc.margin)}">${percent(pc.margin)}</td></tr>`
              )
              .join("")}
          </tbody>
        </table>
      </body></html>
    `;
    return this.renderPdf(html);
  }

  async renderDoctorAnalyticsPdf(data: DoctorAnalyticsData): Promise<Buffer> {
    const html = `
      <html><head><style>${PDF_BASE_STYLE}</style></head><body>
        <h1>Doctor Analytics — ${escapeHtml(data.hospitalName)}</h1>
        <div class="meta">
          Periode ${escapeHtml(data.periodLabel)} · Allocation run ${data.allocationRunId} · Dibuat ${data.generatedAt.toISOString()}<br/>
          ${data.hasDetailAccess ? "Termasuk rincian per dokter (akses doctor_analytics.read_detail)." : "Tampilan agregat, tanpa identitas dokter."}
        </div>

        ${data.summaryRows
          .map((row) => {
            const identified = data.identifiedByServiceId.get(row.serviceId) ?? [];
            return `
              <h2>${escapeHtml(row.serviceCode)} — ${escapeHtml(row.serviceName)}</h2>
              <table>
                <thead><tr><th class="num">Jumlah Dokter</th><th class="num">Pendapatan</th><th class="num">Biaya</th><th class="num">Profit</th><th class="num">Margin</th><th class="num">Di atas P90</th><th class="num">Di bawah P25</th></tr></thead>
                <tbody>
                  <tr>
                    <td class="num">${row.doctorCount}</td>
                    <td class="num">${money(row.totalRevenue)}</td>
                    <td class="num">${money(row.totalCost)}</td>
                    <td class="num">${money(row.totalProfit)}</td>
                    <td class="num">${percent(row.overallMargin)}</td>
                    <td class="num">${row.doctorsAboveP90Count}</td>
                    <td class="num">${row.doctorsBelowP25Count}</td>
                  </tr>
                </tbody>
              </table>
              ${
                identified.length > 0
                  ? `<table>
                      <thead><tr><th>Dokter</th><th class="num">Kasus</th><th class="num">Unit Cost Setara</th><th>Pita Persentil</th><th class="num">Biaya BMHP</th><th class="num">Durasi (menit)</th></tr></thead>
                      <tbody>
                        ${identified
                          .map(
                            (d) => {
                            const bmhpAvg = d.factors.find((f) => f.factor === "bmhp_cost")?.doctorAvg ?? null;
                            const durationAvg = d.factors.find((f) => f.factor === "duration_minutes")?.doctorAvg ?? "—";
                            return `<tr><td>${escapeHtml(d.doctorCode)} — ${escapeHtml(d.doctorName)}</td><td class="num">${d.caseCount}</td><td class="num">${d.unitCostEquivalent !== null ? money(d.unitCostEquivalent) : "—"}</td><td>${d.percentileBand ?? "—"}</td><td class="num">${bmhpAvg !== null ? money(bmhpAvg) : "—"}</td><td class="num">${durationAvg}</td></tr>`;
                          })
                          .join("")}
                      </tbody>
                    </table>`
                  : ""
              }
            `;
          })
          .join("")}
      </body></html>
    `;
    return this.renderPdf(html);
  }

  async renderProfitabilityDetailExcel(data: ProfitabilityDetailData): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();

    const summarySheet = workbook.addWorksheet("Ringkasan Profit Center");
    summarySheet.columns = [
      { header: "Kode", key: "code", width: 12 },
      { header: "Nama", key: "name", width: 28 },
      { header: "Pendapatan", key: "revenue", width: 18 },
      { header: "Biaya Langsung", key: "directCost", width: 18 },
      { header: "Biaya Alokasi", key: "allocatedCost", width: 18 },
      { header: "Total Biaya", key: "totalCost", width: 18 },
      { header: "Laba Kotor", key: "grossProfit", width: 18 },
      { header: "Margin (%)", key: "margin", width: 14 },
    ];
    summarySheet.getRow(1).font = { bold: true };
    for (const pc of data.profitCenters) {
      summarySheet.addRow({
        code: pc.profitCenterCode,
        name: pc.profitCenterName,
        revenue: Number(pc.revenue),
        directCost: Number(pc.directCost),
        allocatedCost: Number(pc.allocatedCost),
        totalCost: Number(pc.totalCost),
        grossProfit: Number(pc.grossProfit),
        margin: pc.margin !== null ? Number(pc.margin) : null,
      });
    }

    for (const pc of data.profitCenters) {
      const services = data.servicesByProfitCenterId.get(pc.profitCenterId) ?? [];
      if (services.length === 0) continue;
      // Sheet names cap at 31 chars and can't contain: \ / * ? : [ ]
      const sheetName = `Detail ${pc.profitCenterCode}`.slice(0, 31).replace(/[\\/*?:[\]]/g, "-");
      const sheet = workbook.addWorksheet(sheetName);
      sheet.columns = [
        { header: "Kode", key: "code", width: 12 },
        { header: "Nama Layanan", key: "name", width: 28 },
        { header: "Biaya Alokasi", key: "allocatedCost", width: 18 },
        { header: "Volume", key: "volume", width: 12 },
        { header: "Unit Cost", key: "unitCost", width: 16 },
        { header: "Tarif Saat Ini", key: "tariff", width: 16 },
        { header: "Selisih Tarif", key: "tariffGap", width: 16 },
      ];
      sheet.getRow(1).font = { bold: true };
      for (const svc of services) {
        sheet.addRow({
          code: svc.serviceCode,
          name: svc.serviceName,
          allocatedCost: Number(svc.serviceAllocatedCost),
          volume: Number(svc.serviceVolume),
          unitCost: svc.unitCost !== null ? Number(svc.unitCost) : null,
          tariff: svc.currentTariff !== null ? Number(svc.currentTariff) : null,
          tariffGap: svc.tariffGap !== null ? Number(svc.tariffGap) : null,
        });
      }
    }

    const rawSheet = workbook.addWorksheet("Data Mentah");
    rawSheet.columns = [
      { header: "Kode Layanan", key: "code", width: 12 },
      { header: "Nama Layanan", key: "name", width: 28 },
      { header: "Profit Center", key: "profitCenterId", width: 20 },
      { header: "Biaya Alokasi", key: "allocatedCost", width: 18 },
      { header: "Biaya Langsung", key: "directCost", width: 18 },
      { header: "Volume", key: "volume", width: 12 },
      { header: "Unit Cost", key: "unitCost", width: 16 },
      { header: "Tarif Saat Ini", key: "tariff", width: 16 },
      { header: "Selisih Tarif", key: "tariffGap", width: 16 },
      { header: "Target Margin (%)", key: "targetMargin", width: 16 },
      { header: "Tarif Rekomendasi", key: "recommendedTariff", width: 18 },
    ];
    rawSheet.getRow(1).font = { bold: true };
    for (const svc of data.allServices) {
      rawSheet.addRow({
        code: svc.serviceCode,
        name: svc.serviceName,
        profitCenterId: svc.profitCenterId,
        allocatedCost: Number(svc.serviceAllocatedCost),
        directCost: Number(svc.serviceDirectCost),
        volume: Number(svc.serviceVolume),
        unitCost: svc.unitCost !== null ? Number(svc.unitCost) : null,
        tariff: svc.currentTariff !== null ? Number(svc.currentTariff) : null,
        tariffGap: svc.tariffGap !== null ? Number(svc.tariffGap) : null,
        targetMargin: Number(svc.targetMarginUsed),
        recommendedTariff: svc.recommendedTariff !== null ? Number(svc.recommendedTariff) : null,
      });
    }

    return Buffer.from(await workbook.xlsx.writeBuffer());
  }

  private async renderPdf(html: string): Promise<Buffer> {
    const { default: puppeteer } = await dynamicImport("puppeteer");
    const browser = await puppeteer.launch({ headless: true });
    try {
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: "load" });
      const pdf = await page.pdf({ format: "A4", printBackground: true, margin: { top: "16mm", bottom: "16mm", left: "12mm", right: "12mm" } });
      return Buffer.from(pdf);
    } finally {
      await browser.close();
    }
  }
}
