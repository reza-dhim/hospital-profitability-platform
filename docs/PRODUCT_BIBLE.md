# PRODUCT BIBLE
## AI Hospital Profitability Intelligence Platform

## 1. Product Vision
Membantu rumah sakit memahami profitabilitas layanan secara menyeluruh melalui distribusi biaya non-profit center ke seluruh profit center, sehingga manajemen dapat menentukan tarif, target revenue, efisiensi biaya, dan evaluasi performa dokter secara objektif.

## 2. Big Objective
Rumah sakit ingin menghitung seluruh biaya dari unit non-profit/cost center lalu membaginya ke seluruh unit profit center. Setelah itu sistem menilai apakah biaya layanan masih menguntungkan, perlu dinaikkan tarifnya, perlu ditambahkan target revenue-nya, atau perlu dilakukan efisiensi.

## 3. Core Business Questions
Platform harus bisa menjawab:
- Profit center mana yang paling menguntungkan?
- Profit center mana yang paling rendah margin-nya?
- Cost center mana yang paling besar?
- Apakah tarif layanan sudah layak?
- Layanan mana yang perlu dinaikkan tarif?
- Layanan mana yang perlu ditingkatkan volume/revenue?
- Tindakan yang sama oleh dokter berbeda, kenapa biayanya berbeda?
- Dokter mana yang memiliki cost variance tertinggi untuk tindakan yang sama?
- Cost driver mana yang menyebabkan kenaikan biaya?
- Apakah biaya aktual wajar dibanding standar?

## 4. Cost Center
Cost Center adalah unit yang tidak menghasilkan pendapatan langsung tetapi mengeluarkan biaya.

Contoh:
- HRD
- Finance
- IT
- Laundry
- CSSD
- Security
- Maintenance
- Marketing
- Utility
- Cleaning Service
- Dapur/Gizi
- Logistik

## 5. Profit Center
Profit Center adalah unit yang menghasilkan pendapatan.

Contoh:
- Rawat Jalan
- Rawat Inap
- ICU
- IGD
- Laboratorium
- Radiologi
- Farmasi
- OK
- Medical Check Up
- Hemodialisa

## 6. Main Formula

### Allocated Cost
Allocated Cost = Total Cost Center Cost × Driver Percentage

### Unit Cost
Unit Cost = Total Allocated Cost / Service Volume

### Gross Profit
Gross Profit = Revenue - Direct Cost - Allocated Cost

### Margin
Margin = Gross Profit / Revenue × 100

### Tariff Gap
Tariff Gap = Current Tariff - Unit Cost

### Recommended Tariff
Recommended Tariff = Unit Cost / (1 - Target Margin)

## 7. Doctor Analytics Concept
Untuk tindakan yang sama, dokter berbeda dapat menghasilkan biaya berbeda karena:
- durasi tindakan berbeda
- penggunaan BMHP berbeda
- durasi ruang operasi berbeda
- kebutuhan perawat/anestesi berbeda
- variasi penggunaan alat
- variasi clinical pathway

Platform harus menghasilkan insight sebagai raport dan catatan manajemen, bukan alat menghukum dokter.

## 8. AI Role
AI berfungsi sebagai decision support:
- menjelaskan penyebab profit turun
- memberi rekomendasi tarif
- mendeteksi outlier cost
- memberi insight variasi biaya dokter
- menyarankan target revenue
- melakukan what-if simulation
- membantu user membaca dashboard
