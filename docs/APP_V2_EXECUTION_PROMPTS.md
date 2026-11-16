# Uygulama v2: Adım adım uygulama promptları

Bu belge küçük ve hızlı modellerin (flash/haiku sınıfı) **sırayla, birer birer** uygulaması için yazıldı.
Plan ve gerekçe: `docs/APP_PLAN_V2.md`. Her prompt tek bir commit üretir. Bir prompt bitmeden sonrakine geçilmez.

**Canlı ilerleme durumu (2026-11-16):** Uygulama kayıtları `docs/APP_V2_LOG.md` içindedir.
P00–P07 ve P10–P17 tamamlandı; P08–P09 makale senkronu önkoşulu olarak tamamlandı.
P19, gerekli artifact-backed Y/E/T engelleyici sayıları izin verilen kaynaklarda
bulunmadığı için kısmi ve durdurulmuş durumdadır. P18, plana göre P22'den sonra
uygulanır; P20–P38 henüz başlamadı. P19 kaynağı çözülmeden P20'ye geçmeyin.

---

## Ortak kurallar (HER promptun başına bu bölümü ekle)

```
ORTAK KURALLAR
1. Çalışma dizini: repo/. Branch: app-v2. Node ve npm kurulu.
2. Yalnızca promptta "Oku" altında listelenen dosyaları oku. Gerekirse en fazla 3 ek dosya oku.
3. Bileşen içinde sayı YAZMA. Ekrandaki her sayı <Num id="..."/> ya da useClaim("...") ile gelir.
   İstisna: eksen tick'leri ve stil değerleri.
4. Önce test yaz (RED), sonra kodu yaz (GREEN). Test dosyaları tests/ altında:
   <alan>.<konu>.test.ts(x).
5. Stil yalnızca CSS Modules ve src/design/tokens.css değişkenleriyle. Ham hex ya da px yasak;
   1px kenar çizgisi serbest.
6. Dosya en fazla 400 satır, fonksiyon en fazla 50 satır, iç içe en fazla 3 seviye. Mutasyon yok.
7. UI metinleri İngilizce. Kod yorumları kısa ve İngilizce.
8. Her promptun sonunda sırayla çalıştır:
     npx tsc -b
     npm run lint
     npm run test:run -- <promptta verilen desen>
   Üçü de geçmeden commit atma.
9. Commit mesajı: "<type>(app-v2): <özet> [Pxx]"
   Son satır: "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
10. DUR VE RAPORLA (düzeltmeye çalışma) şu durumlarda:
    - Bir artifact değeri promptta verilen "beklenen değer" ile uyuşmuyorsa.
    - Bir artifact alanı yoksa.
    - Bir test, yazdığın kodla değil başka bir nedenle düşüyorsa.
    Testi değiştirerek geçirmek YASAK.
11. paper/ dizinine dokunma (makale senkronu P00'dan önce tamamlandı; yeni bir tutarsızlık görürsen DUR ve raporla).
12. Sessiz yedek değer yasak. Veri yoksa <ErrorState> göster.
```

**Doğrulama komutları sözlüğü**
- Dev sunucusu: `npx vite --port 5199 --strictPort --host 127.0.0.1`
- Ekran görüntüsü (P13'ten sonra): `node scripts/shoot.cjs <route> <viewport>` (P13'te oluşturulur)

---

## AŞAMA 0: Hazırlık

### P00: Branch ve baseline
**Amaç:** Başlangıç durumunu kayda geçirmek.
**Adımlar**
1. `git checkout -b app-v2`
2. `npm ci`, ardından `npm run test:run`. Sonucu (geçen ve düşen sayısı) `docs/APP_V2_LOG.md` dosyasına yaz.
   Dosya yoksa oluştur. Başlık `## P00`.
3. `npm run build` çalıştır; `dist/assets` toplam boyutunu aynı dosyaya yaz.
**Kabul:** `docs/APP_V2_LOG.md` var ve test sayılarını içeriyor. Commit: `chore(app-v2): baseline [P00]`

### P01: Bağımlılıklar
**Amaç:** v2'nin ihtiyaç duyduğu paketleri eklemek.
**Adımlar**
1. Kur: `npm i @fontsource/source-serif-4 @fontsource-variable/inter @fontsource/jetbrains-mono d3-scale d3-shape d3-array d3-hexbin zod`
2. Dev bağımlılığı olarak kur: `npm i -D @types/d3-scale @types/d3-shape @types/d3-array @types/d3-hexbin stylelint stylelint-config-standard @playwright/test`
3. `.stylelintrc.json` oluştur:
   ```json
   {"extends":["stylelint-config-standard"],
    "rules":{"color-no-hex":true,
      "declaration-property-value-disallowed-list":{"/^(margin|padding|gap|font-size|border-radius)/":["/\\d+px/"]},
      "selector-class-pattern":null}}
   ```
   `ignoreFiles` alanına `src/design/tokens.css` ve `src/components/**` ekle (eski kod P16'da silinecek).
4. `package.json` scripts alanına `"lint:css": "stylelint \"src/**/*.css\""` ekle.
**Kabul:** `npm run lint:css` çalışıyor (eski dosyalar hariç tutulduğu için 0 hata). Commit: `chore(app-v2): add deps [P01]`

---

## AŞAMA 1: Tek kaynak (Claim Registry)

### P02: Registry iskeleti
**Oku:** `src/data/analysis/metrics_authoritative.json` (yalnızca anahtarlar: `node -e "console.log(Object.keys(require('./src/data/analysis/metrics_authoritative.json')))"`)
**Oluştur**
- `src/claims/types.ts`:
  ```ts
  export type ClaimFormat = 'int' | 'r2' | 'p4' | 'p3' | 'p2' | 'pct1' | 'exact' | 'signed2'
  export type PaperRef = { section: string; line?: number; texValue?: string }
  export type Claim = {
    id: string; label: string; value: number; format: ClaimFormat
    artifact: string; path: string; generator?: string; paperRef?: PaperRef; note?: string
  }
  ```
- `src/claims/format.ts`: `formatClaim(value, format)`. Kurallar: `int` → binlik ayraçlı ("442,026"); `r2` ve `p4` → 4 ondalık; `p3` → 3; `p2` → 2; `pct1` → "67.9%"; `exact` → `String(value)`; `signed2` → "+0.39" ya da "−0.14" (gerçek eksi işareti U+2212).
- `src/claims/registry.ts`: `const CLAIMS: Record<string, Claim>` (şimdilik boş), `getClaim(id)` (bilinmeyen id'de `Error` fırlatır), `listClaims()`.
- `src/claims/useClaim.ts`: `useClaim(id)` hook'u.
**Test (önce yaz):** `tests/claims.format.test.ts`. Format başına en az 2 örnek ve bilinmeyen id için hata testi.
**Komut:** `npm run test:run -- claims`
**Commit:** `feat(app-v2): claim registry skeleton [P02]`

### P03: Registry, denetim ve veri iddiaları
**Oku:** `src/data/analysis/wvs_construct_audit.json`, `src/data/analysis/construct_prevalence.json`, `src/data/analysis/gini_window_sensitivity.json`, `src/data/analysis/zero_fill_sensitivity.json`
**Adımlar:** Önce her dosyanın yapısını yazdır (`node -e "console.log(JSON.stringify(require('./src/data/analysis/<f>.json'),null,1).slice(0,3000))"`). Sonra `src/claims/selectors/audit.ts` ve `src/claims/selectors/data.ts` dosyalarını oluştur. Bunlar JSON'u import eder, zod ile şemayı doğrular ve `Claim[]` döndürür. `registry.ts` bu dizileri birleştirir.
**Beklenen değerler** (makaleden; uyuşmazsa DUR):
| id | değer |
|---|---|
| `audit.respondents` | 442026 (makale bazen 442,473 yazıyor; artifact'taki değer esas alınır, farkı LOG'a yaz) |
| `audit.countryYears` | 305 |
| `audit.Z.alpha` / `audit.Z.cells` | 0.819 / 287 |
| `audit.C.alpha` / `audit.C.cells` | 0.348 / 303 |
| `audit.D.alpha` / `audit.D.cells` | −1.228 / 296 (artifact stores −1.2284774929408622; `p3` displays −1.228) |
| `audit.S.cells` / `audit.S.computable` | 0 / false. **S için alpha claim'i OLUŞTURMA** (artifact'taki 0.753 kalıntı bir değer) |
| `audit.failedCount` | 3 (türetilmiş: computable=false ya da α<0.70 olan yapı sayısı, Z hariç) |
| `data.panelRows` / `data.countries` | 207 / 83 |
| `data.frameShare` | 0.679 (pct1 formatında "67.9%") |
| `data.gini.window.{0,1,2,3,5}.rows` | 102 / 140 / 167 / 184 / 207 |
**Test:** `tests/claims.audit.test.ts`. Tablodaki her satır için bir assertion, ayrıca "S alpha claim'i yok" testi.
**Commit:** `feat(app-v2): audit and data claims [P03]`

### P04: Registry, değerlendirme iddiaları
**Oku:** `functional_form_comparison.json`, `cv_kfold.json`, `cv_country_out.json`, `cv_rolling_origin.json`, `prediction_interval_coverage.json`, `model_ladder_metrics.json`, `metrics_authoritative.json`
**Oluştur:** `src/claims/selectors/evaluation.ts`
**Beklenen değerler:**
| id | değer |
|---|---|
| `eval.linear.inSample` / `eval.bounded.inSample` | 0.4564 / 0.3461 |
| `eval.linear.kfold` / `eval.bounded.kfold` | 0.3976 / 0.4207 (medyan; IQR 0.2050–0.5210 / 0.2282–0.5385) |
| `eval.linear.pooledLoo` / `eval.bounded.pooledLoo` | 0.3983 / 0.4117 |
| `eval.kfold.median.{A,B,C}` | 0.4207 / 0.5239 / 0.5038 |
| `eval.kfold.folds` | 100 |
| `eval.headline.{corr,mae,rmse,bias}` | 0.6150 / 0.1617 / 0.2089 / −0.0440 |
| `eval.coverage.rolling.{A,B,C}` | ortalama kapsama 0.8391 / 0.8600 / 0.7911 (`byProtocolEmpirical.rolling_origin.<tier>.meanCoverage95`); fold payı: 0.44 / 0.44 / 0.56 (`underCoverageRate`) |
| `eval.coverage.countryOut.{A,B,C}` | 0.9127 / 0.9076 / 0.9197 |
| `eval.paired.n` / `eval.paired.shareBoundedAhead` / `eval.paired.median` | 100 / 0.75 / 0.0146 (`functional_form_comparison.json` → `pairedKfold`; IQR 0.0001–0.0276). Anlamlılık testi YOK: foldlar bağımsız değil, UI'da p-değeri gösterme |
| `eval.tier.inSample.{A,B,C}` | 0.4654 / 0.5599 / 0.5658 (`model_ladder_metrics.json`, refit) |
| `eval.tier.cMinusB.median` | −0.0201 (`collinearity_ablation.json` full design) ve repeat-düzeyi −0.0302 (`zero_fill_sensitivity.json`) |
Bunlara ek olarak dağılım verisi için bir `selectEvaluationSeries()` fonksiyonu yaz: tier ve seed başına fold R² dizileri. Bu bir claim değil, grafik verisidir. Seed başına veri yoksa DUR ve raporla.
**Test:** `tests/claims.evaluation.test.ts`
**Commit:** `feat(app-v2): evaluation claims [P04]`

### P05: Registry, sınır iddiaları
**Oku:** `elasticity_profile.json`, `elasticity_bound_sensitivity.json`, `collinearity_diagnostics.json`, `r_collinearity_case.json`, `collinearity_ablation.json`, `lockbox_holdout.json`, `temporal_outlier_2006_sensitivity.json`
**Oluştur:** `src/claims/selectors/limits.ts`, ayrıca grafik verisi için `selectProfileSeries()` (grid noktaları, loss ve p değerleri).
**Beklenen değerler:**
| id | değer |
|---|---|
| `limits.alpha.shipped` | 0.050 |
| `limits.profile.ci95Upper` | 0.016 (artifact'tan HESAPLA: p > 0.05 olan en büyük grid noktası) |
| `limits.profile.bonferroniUpper` | 0.032 (p > 0.05/7 olan en büyük grid noktası) |
| `limits.bound.r2.{before,after}` | 0.3622 / 0.4034 |
| `limits.vif.R` / `limits.vif.E` | 9.43 / 4.83 |
| `limits.dropR.maxVif` | 2.49 |
| `limits.lockbox.cells` / `limits.lockbox.countries` | 17 / 11 |
| `limits.window.r2.{fitting,evaluationContract,realisedRange}` | 0.3466 / 0.3396 / 0.3755 (`structural_window_sensitivity.json`, kayıtlı katsayılar sabit) |
| `limits.window.refit.r2` / `limits.window.refit.alphaOnBound` | 0.3786 / true (kırpmasız refit: α, β yine alt sınırda) |
| `limits.anchors.boundedR2.{fit,evaluation}` | 0.3763 / 0.3317 |
**Test:** `tests/claims.limits.test.ts`. Hesaplanan CI ve Bonferroni sınırlarının testi dahil.
**Commit:** `feat(app-v2): limits claims [P05]`

### P06: Registry, model ve ülke iddiaları
**Oku:** `coefficient_fit.json`, `src/data/feCoefficients.ts`, `src/data/presets.generated.ts`, `failure_log.json`, `parameter_stability.json`
**Oluştur:** `src/claims/selectors/model.ts`, `src/claims/selectors/countries.ts`
**Beklenen değerler:** `model.c.E` +0.39, `model.c.R` +0.26, `model.c.M` −0.14, `model.c.T` −0.09, `model.c.tr` −0.17, `model.c.yr` +0.63, `model.params` 10. Bootstrap aralıkları (`coefficient_bootstrap.json`): sıfırı dışlayan yalnızca `c_E` [+0.10, +0.76] ve `c_yr` [+0.10, +1.15]; `c_M` [−0.30, +0.02], `c_T` [−0.23, +0.09], `c_R` [−0.09, +0.60], `c_tr` [−0.35, +0.04] sıfırı içerir. `model.identified.phi0MinusLnK` = 0.661 [0.491, 0.863]: φ0 ve k ayrı ayrı tanımsızdır. UI'da yalnızca c_E ve c_yr için "identified" ya da "distinguishable from zero" etiketi kullan. Ayrıca `model.withdrawn` = `['C','D','G','S']` (sabit liste; değeri `feCoefficients`'te 0 olduğu doğrulanır).
`countries.ts` ülke başına `{iso3, name, years, zObs, zPred, mae, verdict}` döndürür. Kaynak, `src/data/analysis/preset_country_alignment.json` (`npm run generate:preset-alignment`); makaledeki tablo ve MAE>0.25 listesi (CHN, CZE, FRA, GEO, ITA, POL; 83 ülkenin 15'i eşiği aşar) bu artifact'la birebir aynıdır, fark beklenmez (fark çıkarsa DUR).
**Test:** `tests/claims.model.test.ts`
**Commit:** `feat(app-v2): model and country claims [P06]`

### P07: Registry bütünlük testi
**Oluştur:** `tests/claims.integrity.test.ts`. Şunları doğrular: her claim'in `artifact` dosyası diskte var; `path` JSON içinde çözülüyor; `value` sonlu bir sayı; id'ler benzersiz; her `paperRef.section` boş değil.
**Commit:** `test(app-v2): registry integrity [P07]`

### P08–P09: TAMAMLANDI (2026-11-15), ATLA
Makale senkronu P00'dan önce yapıldı: `scripts/check_manuscript_consistency.ts` artık 38 bloğu artifact'larla karşılaştırıyor (`npm run check:manuscript-consistency`), düzeltmeler ve hâlâ açık maddeler `docs/PAPER_SYNC_REPORT.md` içinde. `check_paper_claims.ts` yazma. P07'den sonra doğrudan P10'a (ya da paralel hat için P03–P06 bitince P14'e) geç. Registry'deki `paperRef.texValue` alanları isteğe bağlıdır; mevcut kontrol kapsamı yeterlidir.

---

## AŞAMA 2: Tasarım sistemi

### P10: Token'lar, fontlar, reset
**Oluştur**
- `src/design/tokens.css`: `APP_PLAN_V2.md` §4.1–4.4'teki bütün token'lar `:root` altında. Koyu tema `[data-theme="dark"]` altında; `@media (prefers-color-scheme: dark)` ile `:root:not([data-theme="light"])` için de tanımlı. Değişken adları: `--bg --surface --surface-2 --ink --ink-2 --ink-3 --line --accent --pass --withdrawn --unidentified --exploratory --focus --tier-a --tier-b --tier-c --linear`, `--space-1..9` (4…96), `--radius-1..3`, `--shadow-1`, `--font-serif --font-sans --font-mono`, `--fs-12 --fs-14 --fs-16 --fs-18 --fs-28 --fs-40`, `--dur-1..3`, `--ease`, `--w-prose:680px --w-wide:960px --w-full:1200px`.
- `src/design/fonts.ts`: fontsource import'ları (serif 400/600, inter variable, mono 400).
- `src/design/reset.css`: modern reset; `body { background: var(--bg); color: var(--ink); font-family: var(--font-sans) }`; `:focus-visible` halkası; `@media (prefers-reduced-motion: reduce)` altında animasyonları kapatan kural.
**Test:** `tests/design.tokens.test.ts`. CSS dosyasını metin olarak okuyup her token'ın iki temada da tanımlı olduğunu doğrular. Ayrıca token çiftleri için kontrast hesabı: `--ink` / `--bg` ≥ 7, `--ink-2` / `--bg` ≥ 4.5, durum renkleri / `--surface` ≥ 4.5. Kontrast formülünü (WCAG relative luminance) testin içinde yaz.
**Commit:** `feat(app-v2): design tokens [P10]`

### P11: UI kiti, bölüm 1
**Oluştur** (`src/ui/<Name>.tsx` + `<Name>.module.css`): `Button`, `IconButton`, `Badge`, `Card`, `Callout`, `SectionHeader`, `Kbd`, `Skeleton`, `ErrorState`.
**Spesifikasyon**
- `Badge`: `variant: 'pass'|'withdrawn'|'unidentified'|'exploratory'|'neutral'`. İkon (lucide: CheckCircle2, XCircle, HelpCircle, FlaskConical, Circle) ve metin birlikte. Arka plan, rengin %10 karışımı (`color-mix(in srgb, var(--pass) 10%, transparent)`).
- `SectionHeader`: props `{eyebrow, title, lede}`. Eyebrow 12px büyük harf, title serif `--fs-40`, lede serif 18/30 ve en fazla `--w-prose`.
- `ErrorState`: props `{artifact, message}`. Metin: "Could not read {artifact}. This is a build defect, not missing data."
**Test:** `tests/ui.kit1.test.tsx`. Her bileşen render oluyor; Badge'in erişilebilir adında metin var; Button `disabled` iken tıklama çalışmıyor.
**Commit:** `feat(app-v2): ui kit part 1 [P11]`

### P12: UI kiti, bölüm 2 (etkileşimli)
**Oluştur:** `Tabs`, `SegmentedControl`, `Slider`, `Toggle`, `Popover`, `Tooltip`, `Drawer`, `DataTable`, `FigureFrame`, `Num`.
**Spesifikasyon**
- `Slider`: props `{min, max, step, value, onChange, marks?: {value, label}[], paperValue?: number, label}`. `paperValue` noktasında "paper" etiketli bir işaret gösterir. Klavyede ok tuşu, PageUp/PageDown ve Home/End çalışır. `aria-valuetext` içinde formatlı değer.
- `SegmentedControl`: radiogroup rolü, ok tuşlarıyla gezinme.
- `DataTable<T>`: props `{columns: {key, header, align?, render?, sortable?}[], rows, stickyFirst?, caption}`. Başlığa tıklayınca sıralama yapar; `aria-sort` doğru set edilir. Sarmalayıcı `overflow-x:auto`.
- `FigureFrame`: props `{number, title, children, scope, method, boundary, sources: string[]}`. Alt bilgide "Data scope · Method context · Interpretation boundary" satırları ve her kaynak için bir çip.
- `Num`: props `{id, format?}`. `useClaim` ile değeri alır. Değer mono fontla, `tabular-nums` ve noktalı alt çizgiyle gösterilir. Tıklama `ClaimInspector`'ı açar (P15'e kadar `title` attribute'u kullan). `data-claim-id` attribute'u taşır.
- `Popover`/`Drawer`: odak tuzağı, Esc ile kapanma, odağın açan öğeye geri dönmesi.
**Test:** `tests/ui.kit2.test.tsx`. Slider klavye etkileşimi, DataTable sıralama ve `aria-sort`, Num'un registry değerini doğru formatta göstermesi, Drawer'da Esc.
**Commit:** `feat(app-v2): ui kit part 2 [P12]`

### P13: Grafik kiti ve kit galerisi
**Oluştur** (`src/charts/`): `useChartSize.ts` (ResizeObserver), `Axis.tsx`, `CompareBars.tsx`, `DistStrip.tsx`, `LineProfile.tsx`, `Heatmap.tsx`, `Funnel.tsx`, `HexScatter.tsx`, `Calibration.tsx`.
**Ortak spesifikasyon:** SVG; `role="img"`; `<title>` ve `<desc>`; görsel olarak gizli bir `<table>` veri yedeği; renkler yalnızca CSS değişkenlerinden; yazı en az 12px; tooltip'te `Num` ya da formatlı değer; boş veride `ErrorState`.
- `CompareBars`: props `{groups: {label, values: {series, value, claimId?}[]}[], series: {key, label, color}[], domain?}`. Gruplu yatay çubuklar ve değer etiketleri.
- `DistStrip`: props `{series: {key, label, color, values:number[]}[], reference?: {value,label}}`. Jitter'lı noktalar, IQR kutusu, medyan çizgisi.
- `LineProfile`: props `{points:{x,y}[], thresholds?:{y,label,style}[], highlightX?:{x,label}[], xLabel, yLabel, logX?}`.
- `Heatmap`: props `{rows, cols, values:(number|null)[][], scale:'viridis'|'diverging', legendLabel}`. `null` hücreler tarama desenli.
- `Funnel`: props `{steps:{label,value,claimId}[]}`. Adımlar arasında kayıp etiketi.
**Kit galerisi:** `src/app/KitGallery.tsx`, yalnızca `import.meta.env.DEV` iken `?v=__kit` route'unda açılır. Tüm UI ve grafik bileşenlerini örnek veriyle iki temada gösterir.
**Ekran görüntüsü aracı:** `scripts/shoot.cjs` (playwright-core ve sistem Chrome'u). Argümanlar: route, viewport (`mob|tab|desk` → 390×844 / 768×1024 / 1440×900), tema. Çıktı: `tmp/shots/`. `.gitignore`'a `tmp/` ekle.
**Test:** `tests/charts.render.test.tsx`. Her grafik örnek veriyle render oluyor, gizli tabloda doğru sayıda satır var.
**Commit:** `feat(app-v2): chart kit and gallery [P13]`

---

## AŞAMA 3: Kabuk

### P14: AppShell ve router
**Oku:** `src/router/routes.ts`, `src/router/useAppRoute.ts`, `src/utils/urlState.ts`, `src/main.tsx`
**Oluştur**
- `src/app/routes.ts`: `APP_PLAN_V2.md` §3.2'deki 11 route. Her biri `{id, number, title, eyebrow, paperRef, load: () => import(...)}`.
- `src/app/redirects.ts`: eski route'lardan yeni route'lara eşleme (`component-analysis|field-dynamics|statistical-analysis|sensitivity-analysis|emergence-analysis|model-diagnostics|advanced-parameters|phi-contributions` → `geometry`, `presets` → `countries`, `documentation` → `glossary`, `ai-interpreter` → `overview`).
- `src/app/AppShell.tsx` + CSS: sticky header (56px, `backdrop-filter: blur(12px)`), sol TOC (248px, sticky, scroll-spy ile aktif bölüm ve okuma ilerleme çubuğu), ana içerik alanı, bölüm sonunda önceki/sonraki bağlantıları. 1024px altında TOC bir `Drawer` içine taşınır. Tema anahtarı `ThemeContext`'i kullanır.
- Her route için geçici `src/sections/<id>/index.tsx`: yalnızca `SectionHeader` ve "In progress" `Callout`'u.
- `src/main.tsx`: `App` yerine `AppShell` render edilir. Eski `App.tsx` henüz silinmez ama hiçbir yerden import edilmez.
- `index.html`: `<title>Measurement Validity Before Model Geometry · Interactive Audit</title>` ve `meta description`.
**Test:** `tests/app.routes.test.ts` (11 route, redirect'ler, bilinmeyen route `overview`'a düşüyor), `tests/app.shell.test.tsx` (TOC 11 bağlantı içeriyor, aktif route `aria-current` taşıyor).
**Kabul:** `node scripts/shoot.cjs overview desk` ve `… mob`: başlık tek satır, çakışma yok.
**Commit:** `feat(app-v2): app shell and routes [P14]`

### P15: Komut paleti ve Claim Inspector
**Oluştur**
- `src/claims/ClaimInspector.tsx`: `Popover` içinde `label`, büyük değer, artifact (kopyala butonu), `path`, `generator`, `paperRef` ("Paper §4 · line 362") ve "Open artifact" bağlantısı (`?v=reproduce&artifact=<f>`). Sağlayıcı: `InspectorProvider`. `Num` tıklaması inspector'ı açacak şekilde güncellenir.
- `src/app/CommandPalette.tsx`: ⌘K / Ctrl+K ile açılır. Route'lar, claim'ler (label ve değer) ve artifact'lar arasında bulanık arama (basit alt dize puanlaması yeterli). Enter ile seçilen öğeye gider; claim için ilgili bölüme gidip inspector'ı açar.
**Test:** `tests/app.inspector.test.tsx`, `tests/app.palette.test.tsx`
**Commit:** `feat(app-v2): claim inspector and command palette [P15]`

### P16: Eski arayüzü sil
**Adımlar**
1. `src/App.tsx`, `src/App.css`, `src/index.css` (yeni reset dışında kalan kısımlar) ve `src/components/` dizininin TAMAMINI sil. İstisna: `src/components/visualization/surface/{geometry,camera,colorScale}.ts` dosyalarını önce `src/sections/geometry/engine/` altına `git mv` ile taşı.
2. `src/router/` dizinini sil (yerini `src/app/` aldı). `urlState.ts` içinde route ile ilgili kısımları `src/app/routes.ts`'e uyarla.
3. Silinen bileşenleri import eden testleri sil (`components.*`, `accessibility.context` ve `theme.context` hariç; bu ikisi context testidir, korunur). Silinen her test dosyasının adını LOG'a yaz.
4. `tests/visual-baselines/` dizinini sil. `scripts/check_visual_baselines.ts` geçici olarak "no baselines" mesajıyla SKIP etsin (P37'de yeniden kurulacak).
5. `scripts/render_check.cjs` ve `scripts/route_check.cjs` içindeki ROUTES listesini yeni 11 route ile güncelle. FORBIDDEN listesine şunları ekle: `/Belief Emergence/i`, `/emergent signal/i`, `/\bamplifier/i`, `/\bsuppressor/i`, `/0\.8461/`.
6. `.stylelintrc.json` içindeki `src/components/**` istisnasını kaldır.
7. `package.json`'dan kullanılmayan paketleri kaldır: `react-markdown`, `remark-*`, `rehype-*`, `react-katex` (KaTeX doğrudan kullanılacak), `html2canvas` (P32 kendi yöntemini kullanacak), `framer-motion` (CSS geçişleri yeterli). Her birinin kullanılmadığını `grep -r` ile doğrula.
**Kabul:** `npx tsc -b`, `npm run lint`, `npm run lint:css` ve `npm run test:run` hepsi geçiyor. `grep -ri "amplif\|suppress" src` sonucu yalnızca açıklayıcı metinlerde ve P23'teki "reading signs" bölümünde olabilir (şu an 0).
**Commit:** `refactor(app-v2)!: remove legacy interface [P16]`

---

## AŞAMA 4: Bölümler

**Her bölüm promptu için ortak yapı:** `src/sections/<id>/index.tsx` (en fazla 150 satır, yalnızca kompozisyon) ve alt bileşenler `src/sections/<id>/*.tsx`. Bölüm `SectionHeader` ile başlar ve her şekil `FigureFrame` içindedir. Tüm sayılar `Num` ile gelir. Test dosyası: `tests/section.<id>.test.tsx`. Testte claim'lerin DOM'da `data-claim-id` ile bulunduğu ve etkileşimin URL'i güncellediği kontrol edilir. Bölümün sonunda: `node scripts/shoot.cjs <id> desk` ve `mob` ile görüntü al ve kontrol et: taşma ve çakışma yok.

### P17: Overview: hero ve bulgu kartları
**İçerik**
- Eyebrow "Interactive companion · Research article"; başlık; alt başlık "A Reproducible Audit of Bounded Response Models"; bir lede paragrafı (makale Abstract'ının ilk iki cümlesinin özeti, en fazla 50 kelime).
- 4 `FindingCard` (yeni bileşen: büyük `Num`, kısa açıklama, "→ Section" bağlantısı, durum `Badge`'i):
  1. "3 of 4" (`audit.failedCount`) · "configured constructs fail reliability" · withdrawn · → audit
  2. "r = 1.000000000000" (`gates.original.identityCorr`; P22 bu claim'i üretir. P22'den önce bu kartı `Skeleton` ile bırak, P22'de bağla) · "outcome was a rescaling of a predictor" · withdrawn · → gates
  3. `eval.bounded.kfold` vs `eval.linear.kfold` · "bounded ≈ linear out of sample" · neutral · → evaluation
  4. "α ≤ 0.03" (`limits.profile.bonferroniUpper`) · "structural exponent not identified" · unidentified · → limits
- "How to read this": 3 madde (validity first; every number is clickable; decisions are interactive).
**Commit:** `feat(app-v2): overview hero [P17]`

### P18: Overview: Audit Replay
**İçerik:** Kaydırmalı, 4 adımlı anlatı. Sol sütunda sticky bir "panel durumu" kartı (4 kapı satırı ve Badge'ler), sağ sütunda adım metinleri. `IntersectionObserver` aktif adımı belirler.
- Adım 0 "The submitted panel": 4 kapının hepsi `withdrawn` (FAIL).
- Adım 1 "Identity": outcome = rescaled C (A006). Kapı 1 düzeliyor.
- Adım 2 "Duplicates & rank": kapı 2 ve 3 düzeliyor.
- Adım 3 "Reliability": C ve D geri çekiliyor, S hesaplanamıyor.
- Adım 4 "The honest comparison": bounded ve linear başa baş. Mini `CompareBars`.
Mobilde sticky kart, adım metinlerinin üstünde ve normal akışta yer alır. `prefers-reduced-motion` açıksa geçiş animasyonu yok. Klavyeyle gezinme için ayrıca "Step 1 2 3 4" butonları bulunur. (P22'den sonra uygulanmalı; kapı verisi P22'de üretilir.)
**Commit:** `feat(app-v2): audit replay [P18]`

### P19: Data & Support: funnel ve destek
**İçerik:** Şekil 1.1 `Funnel` (442,026 respondents → 305 country-years → 287 outcome cells → 207 estimation rows; her adım bir claim). Şekil 1.2: değişken başına engelleyici çubukları (Y 131, E 92, T 46; değerler artifact'tan, kaynak `construct_prevalence.json` ya da `gini_window_sensitivity.json` meta alanı; bulunamazsa DUR). Şekil 1.3: ülke × yıl destek `Heatmap`'i (`DataContext` panelinden; hücrede satır var ya da yok; ülkeler satır sayısına göre sıralı).
**Commit:** `feat(app-v2): data and support [P19]`

### P20: Data: Gini penceresi ve zero-fill
**İçerik**
- Decision Lab 1, "How far may a Gini value be borrowed?": `SegmentedControl` (exact, ±1, ±2, ±3, ±5) ve `paperValue=±5`. Seçime göre büyük `Num` (satır sayısı) ve recovered cells değişir; küçük bir `LineProfile` pencereye karşı satır sayısını gösterir ve seçili noktayı vurgular. Altta `Callout`: "Paper adopts ±5 years; the curve is published so you can choose your own tolerance."
- Decision Lab 2, "Do the imputed zero-death cells carry the result?": `Toggle`. Açıkken Tier C−B farkı (k-fold) ve median per-repeat farkı tam panel ile sıfır-çapa hücreleri çıkarılmış panel arasında değişir. Sonuçta `Callout` (caution): "The ordering is conditional on the zero-death inference."
- URL state: `gw=5`, `zf=0|1`.
**Commit:** `feat(app-v2): gini window and zero-fill labs [P20]`

### P21: Construct Audit
**İçerik**
- Tablo 2.1 `DataTable`: Construct · Configured · Usable · Cells · α · Verdict (Badge). S satırında α hücresi "not computable" yazar. Mobilde ilk sütun sabit.
- Decision Lab 3, "Reliability floor": `Slider` 0.30–0.90, adım 0.05, `paperValue=0.70`. Her yapının Verdict'i canlı güncellenir (α ≥ eşik → pass). Z her zaman geçer. Üstte "N of 4 constructs admitted" sayacı.
- Şekil 2.2: C ve D için madde arası korelasyon `Heatmap`'i (diverging). Artifact'ta matris yoksa bu şekli ATLA ve LOG'a yaz; uydurma.
- `Callout` (finding): "They do not exist in this item pool at this aggregation level." (makale §4, alıntı olarak.)
- URL state: `rf=0.70`.
**Commit:** `feat(app-v2): construct audit [P21]`

### P22: Design Gates
**İçerik**
- 4 `GateCard` (yeni bileşen): kural (ör. `|corr(xj, Z)| < 0.999`), ölçülen değer ve Badge.
- Decision Lab 4: `SegmentedControl` "Original panel | Rebuilt panel". Original: 4 kapı FAIL; değerler r=1.000000000000, maks. sapma 4.4e-15, 1,128 satır, R²=1.000000. Rebuilt: 4 kapı PASS ve ölçülen değerler. Bu değerler bir artifact'ta yoksa: `scripts/generate_design_gates.ts` yaz, `q1_submission_gate_report.json` ve KNOWN_ISSUES içindeki kayıtlı ölçümleri `src/data/analysis/design_gates.json` dosyasına üret (orijinal panel `git show` ile okunabiliyorsa yeniden hesapla; okunamıyorsa kayıtlı değerleri `"source":"recorded"` notuyla yaz). `package.json`'a `generate:design-gates` ekle. `src/claims/selectors/gates.ts` ile `gates.*` claim'lerini (ör. `gates.original.identityCorr`) registry'ye ekle; ardından P17'deki 2. bulgu kartını bağla.
- "Root cause" diyagramı: A006 → Z item 1 → C index (SVG, 3 kutu ve oklar).
- URL state: `panel=original|rebuilt`.
**Commit:** `feat(app-v2): design gates [P22]`

### P23: The Model
**İçerik**
- Denklemler: KaTeX `renderToString` ile, sunucusuz. `S = X^α Y^β e^Φ`, `Z = S/(S+k)`, `logit Z = …`, `Z = σ(Φ+s)`.
- Φ terim haritası: her terim bir çip. M, T, E, R, tr, yr çipleri aktif ve katsayılarıyla (`Num`). C, D, G, S çipleri soluk, üstü çizili ve "withdrawn §2" Badge'li. Hover ya da focus ile katsayı, kaynak ve paperRef gösterilir.
- Tablo 4.1: katsayılar, işaret ve "identified?" sütunu (M için "sign flipped across panels; not identified" notu).
- "How many specifications were tried": 4 kart (Tier A/B/C ve OLS) ve parametre sayıları.
- "Reading the signs": 3 paragraf (makale §5 Interpretation layer'dan). Yalnızca M, T, E, R için koşullu dil. "Amplifier" ve "suppressor" kelimeleri yalnızca tırnak içinde, makaleden alıntı olarak kullanılabilir (render_check FORBIDDEN listesinde bu bölüm için istisna tanımla).
**Commit:** `feat(app-v2): model section [P23]`

### P24: Evaluation: Linear vs Bounded (hero)
**İçerik:** Şekil 5.1 `CompareBars`: 3 grup (In-sample, Grouped k-fold, Pooled LOO) × 2 seri (Linear, Bounded). Altında büyük bir sonuç cümlesi: "A near-tie: <Num eval.bounded.kfold/> vs <Num eval.linear.kfold/> out of sample." `Callout`: "An earlier draft claimed the linear baseline won decisively. That claim could not be regenerated and is withdrawn." Bir `DistStrip` iki modelin k-fold dağılımını IQR'larıyla gösterir (artifact'ta fold serisi varsa).
**Commit:** `feat(app-v2): functional form comparison [P24]`

### P25: Evaluation: protokoller ve tier'lar
**İçerik:** `Tabs`: "Grouped k-fold (primary)" | "Leave-one-country-out (stress test)" | "Rolling origin (temporal scope)" | "Coverage".
- k-fold: `DistStrip` Tier A/B/C (100 fold), medyanlar `Num`. Decision Lab 5, seed seçici: `SegmentedControl` (artifact'taki seed'ler). Seçili seed için Tier C−B farkı ve işareti gösterilir; altında "sign flips on N of M seeds" claim'i.
- LOO: per-fold medyanı ile pooled R² yan yana; açıklama "variance ratio on 1–4 points".
- Rolling: fold başına RMSE çizgisi.
- Coverage: tier başına nominal %95 ile gözlenen kapsama çubukları.
- Alt bölüm "In-sample context": Tablo `panel_fit_headline` (R², Corr, MAE, RMSE, Bias) ve `HexScatter` + `Calibration` (veri: `observed_vs_predicted_authoritative.csv`, papaparse ile). Tier C'nin her görünümünde "exploratory" Badge'i bulunur.
- URL state: `tab=kfold|loo|rolling|coverage`, `seed=<n>`.
**Commit:** `feat(app-v2): evaluation protocols [P25]`

### P26: Limits: exponent ve multiplicity
**İçerik**
- Şekil 6.1 `LineProfile`: x = α (log), y = profile loss ya da LR istatistiği. Eşik çizgisi χ²₁(0.95)=3.84; Bonferroni açıkken eşik χ²₁(1−0.05/7). Dikey işaretler: shipped α=0.050 (kırmızı, "outside interval") ve CI üst sınırı.
- Decision Lab 6: `Toggle` "Charge multiplicity (Bonferroni, 7 grid points)". CI üst sınırı 0.016 ile 0.032 arasında değişir (claim'ler P05'ten).
- Kart "Moving the bound": 0.050 → 0.001 ile R² 0.3622 → 0.4034. `Callout`: "The constraint binds; the data prefer α, β → 0."
- URL state: `bonf=0|1`.
**Commit:** `feat(app-v2): exponent limits [P26]`

### P27: Limits: kolineerlik, lockbox, 2006
**İçerik**
- Tablo 6.2: VIF (6 kovaryat), R ve E vurgulu, `R = 7.30·HDI − 6.01` notu.
- Decision Lab 7, "Drop R?": `Toggle`. Açıkken maks. VIF, in-sample R² farkı ve Tier A/B k-fold değişimi gösterilir (değerler artifact'tan). Ardından ZORUNLU olarak bir `Callout` (caution) belirir: "This is why it is not dropped: removing R after seeing the fit improve is post-hoc specification selection." Toggle açıkken sayfa üstünde "counterfactual, not the reported model" bandı görünür.
- Kart "Lockbox scope": 17 cells / 11 countries; 59 recovered cells are out-of-sample but not blind.
- Kart "2006": inter-item r 0.699 vs 0.932; ΔR² tier'lar (artifact'tan).
- URL state: `dropR=0|1`.
**Commit:** `feat(app-v2): collinearity, lockbox, 2006 [P27]`

### P28: Countries
**İçerik:** `DataTable` (Country, ISO3, Years, Z̄, Ẑ, MAE, Verdict): sıralanabilir, üstte arama kutusu, verdict filtresi (`SegmentedControl`). Satıra tıklayınca `Drawer` açılır: ülkenin yıllara göre gözlenen ve tahmin değerleri (`LineProfile`, iki seri), failure log notu (EST/RUS/SVK) ve "Open in Geometry Lab" butonu (`?v=geometry&iso=<ISO3>`). Withdrawn kanallar tabloda YOK.
- URL state: `iso=<ISO3>`, `q=<arama>`.
**Commit:** `feat(app-v2): countries [P28]`

### P29: Geometry Lab: kontroller ve yüzey
**Oku:** `src/sections/geometry/engine/*`, `src/utils/calculateModel.ts`, `src/utils/uiToModelTransform.ts`
**İçerik**
- Kalıcı bant (`Callout` caution, kapatılamaz): "In-sample geometry of the fitted map · not out-of-sample evidence · α, β sit at their bound."
- Sol kontrol paneli: X, Y, M, T, E, R için `Slider`'lar. Aralıklar panel min/max değerleri, `paperValue` panel ortalaması. Altında "Withdrawn channels" kilitli listesi: C, D, G, S, kilit ikonu ve "§2" bağlantısı. Model çağrısı bu dört kanalı 0 olarak alır; bir test bunu sabitler.
- Sağda: Plotly 3D yüzey (`React.lazy`, yalnızca bu bölümde). Eski engine'den `geometry`, `camera` ve `colorScale` kullanılır. Üstte anlık değer kartları: Z, Φ, s, Z(1−Z) (bunlar claim değil, hesaplanan değerlerdir; `Num` yerine `ComputedValue` bileşeni kullan ve "computed live" etiketi ekle).
- `?iso=` parametresi verilmişse slider'lar o ülkenin ortalama değerleriyle başlar.
- URL state: tüm slider değerleri (mevcut `urlState` encoder'ı ile).
**Test:** withdrawn kanalların modele 0 olarak gittiği; `iso` parametresinin slider'ları doldurduğu.
**Commit:** `feat(app-v2): geometry lab controls and surface [P29]`

### P30: Geometry Lab: destek ve 2D eşlikçiler
**İçerik**
- `Toggle` "Show observed support" (VARSAYILAN AÇIK): 207 gözlem yüzey üstünde nokta olarak gösterilir; destek dışı (X, Y) bölgeleri yarı saydam gri.
- 2D eşlikçiler (`Tabs`): (Φ, s) `Heatmap` ve Z=0.5 ridge çizgisi; Z(Φ) ve Z(1−Z) `LineProfile`; mevcut durum her grafikte işaretli.
- Capture A/B: iki durumu sakla ve farkı tablo olarak göster (ΔZ, ΔΦ). Paylaş: URL'i kopyala.
- Dışa aktarma: PNG (Plotly `toImage`) ve mevcut `exportCsv` ile CSV.
**Commit:** `feat(app-v2): geometry support and companions [P30]`

### P31: Evidence & Reproducibility ve Notation
**İçerik**
- `reproduce`: artifact listesi (`src/evidence/evidenceIndex.ts` verisi): ad, şema, üretim tarihi, satır sayısı, "used in sections" sütunu ve claim sayısı. Satır seçilince sağdaki `Drawer`'da JSON görüntüleyici açılır (katlanabilir ağaç, en fazla 2.000 düğüm, `?artifact=` ile derin link). Ayrıca CI kapıları listesi (`scripts/ci_gate.ts` adımları), provenance zinciri diyagramı (WVS → constructs → panel → fit → artifacts → app ve paper) ve kopyalanabilir komut blokları (`npm run replicate`, `npm run ci:gate`).
- `glossary`: `notation_glossary.json` için arama kutusu ve tablo. Semboller KaTeX ile render edilir.
**Commit:** `feat(app-v2): reproduce and glossary [P31]`

---

## AŞAMA 5: Dışa aktarma ve belgeler

### P32: Kanıt paketi PDF
**Oku:** `src/utils/pdf/exportBehavioralDynamicsReport.ts` (yalnızca yapı için)
**Oluştur:** `src/export/evidenceBundle.ts`. jsPDF ile şunları içeren bir PDF üretir: başlık sayfası (makale başlığı, tarih, commit hash'i `import.meta.env.VITE_COMMIT`), her bölüm için kullanılan claim'ler tablosu (id, değer, artifact, paperRef), mevcut URL state'i ve QR yerine düz URL. Header'daki "Export evidence bundle" butonu bunu tetikler (`React.lazy`). Eski `exportBehavioralDynamicsReport.ts` ve `pdfFonts.ts` silinir; ilgili testler güncellenir ya da silinir (LOG'a yaz). `vite.config.ts`'te `VITE_COMMIT` tanımlanır (`git rev-parse --short HEAD`). Ayrıca `vite.config.ts` içindeki `/api/ai/interpret` middleware'i silinir.
**Test:** PDF metninde 10 rastgele claim değeri bulunuyor (jsPDF çıktısı string olarak taranır).
**Commit:** `feat(app-v2): evidence bundle export [P32]`

### P33: README
**Oluştur:** `scripts/generate_readme.ts`. README'nin metrik ve rozet bloklarını `<!-- claims:start -->` ve `<!-- claims:end -->` işaretleri arasında registry'den üretir. Eski blokları (630, 0.8461, 23 ülke, 100/100) kaldır. Başlığı makale başlığıyla değiştir. "Live app" bölümü 11 route'u listeler. `check:no-hardcoded-headline` README'yi de tarayacak şekilde genişletilir. `package.json`: `"generate:readme"`.
**Commit:** `docs(app-v2): readme from registry [P33]`

### P34: Makale ekran görüntüleri
**Not:** veriye bağlı şekiller (S1, S2, S5, A2, A3, Şekil 1) zaten `npm run generate:data-figures` ile artifact'lardan üretiliyor; bu adım yalnızca UI ekran görüntülerini yeniler.
**Oluştur:** `scripts/capture_paper_figures.ts` (playwright). Supplementary'de kullanılan UI görsellerini yeni arayüzden üretir: `figure_7_ui_dashboard.png` (overview, desk, light), `figure_8_ui_pinned_inspection.png` (geometry, inspector açık), `figure_9_ui_presets.png` (countries), `figure_A4…A7` (audit, gates, evaluation, limits), `figure_A9…A14` (model, data, evaluation coverage, limits profile, geometry companions, reproduce). Çıktı `paper/supplementary/`. Caption metinlerine DOKUNMA; yeni görsellere karşılık gelmeyen caption'ları LOG'a "insan kararı" olarak yaz. `package.json`: `"generate:paper-figures"`.
**Commit:** `feat(app-v2): paper ui figures from app [P34]`

---

## AŞAMA 6: Kalite

### P35: Düzen kontrolleri
**Oluştur:** `scripts/layout_check.cjs`. 11 route × 3 viewport × 2 tema için şunları kontrol eder:
1. `document.documentElement.scrollWidth <= clientWidth`.
2. Görünür metin öğelerinin (`p, h1–h4, span, td, th, button, label`) bounding box'ları, aynı stacking context'te ve ebeveyn-çocuk ilişkisi olmadan %10'dan fazla kesişmiyor.
3. Görünür metinlerde `getComputedStyle(fontSize) >= 12px`.
4. `el.scrollWidth > el.clientWidth` ve `overflow` hidden olan metin öğesi yok (`title` attribute'u ve tooltip'i olanlar hariç).
5. Belge seviyesinde kaydırma: `scrollHeight > innerHeight` (overview için).
`package.json`: `"check:layout"`. `ci_gate.ts`'e ekle.
**Commit:** `test(app-v2): layout guards [P35]`

### P36: Erişilebilirlik ve E2E
**Oluştur:** `e2e/` (Playwright test runner) ve `playwright.config.ts` (webServer: vite 5199).
- `e2e/a11y.spec.ts`: axe-core, 11 route × 2 tema, 0 ihlal.
- `e2e/referee.spec.ts`: overview → bulgu kartı 1 → audit → reliability slider'ını 0.30'a çek → admitted sayacı değişiyor (beklenen sayıyı artifact'tan hesapla) → gates → Original → 4 FAIL.
- `e2e/replicator.spec.ts`: ⌘K → "kfold" → claim seç → inspector açılıyor → "Open artifact" → JSON görüntüleyicide `cv_kfold.json`.
- `e2e/explorer.spec.ts`: countries → TUR → Open in Geometry Lab → slider'lar doldu → C slider'ı yok → withdrawn listesi görünüyor.
- `e2e/mobile.spec.ts`: 390px → TOC drawer → evaluation → tablo yatay kayıyor → sayfa yatay kaymıyor.
- `e2e/keyboard.spec.ts`: yalnızca klavyeyle audit slider'ı ve gates anahtarı kullanılabiliyor, odak her zaman görünür.
`package.json`: `"test:e2e": "playwright test"`. `ci_gate.ts`'e ekle.
**Commit:** `test(app-v2): a11y and e2e journeys [P36]`

### P37: Görsel baseline'lar
**Adımlar:** `scripts/check_visual_baselines.ts` dosyasını 11 route × {390, 1440} × {light, dark} = 44 görüntü için güncelle (eşik mevcut kuralla aynı). Görüntüleri yalnızca P35 ve P36 yeşilken üret: `tests/visual-baselines/<route>-<vp>-<theme>.png`. Commit'ten önce 44 görüntüyü tek tek aç ve gözle kontrol et: çakışma, kesilme ya da boş alan varsa DUR ve raporla.
**Commit:** `test(app-v2): visual baselines [P37]`

### P38: Bütçe ve son kapı
**Adımlar**
1. `scripts/check_bundle_budget.ts`: ilk JS (geometry chunk'ı hariç) ≤ 350 KiB gzip; geometry chunk'ı ayrıca raporlanır.
2. FCP ve LCP ölçümü (mevcut performans script'ine LCP ekle): FCP medyanı ≤ 1500 ms, LCP ≤ 2500 ms.
3. `npm run ci:gate` tam koşu; sonucu `docs/APP_V2_LOG.md`'ye yaz.
4. `docs/APP_PLAN_V2.md` §8 Bitti tanımındaki her maddeyi tek tek işaretle; her biri için kanıt komutunu yaz.
5. `.github/workflows` içinde e2e ve layout adımlarının CI'da çalıştığını doğrula.
**Commit:** `chore(app-v2): budgets and final gate [P38]`

---

## Sıra ve paralellik

```
P00 → P01 → P02 → P03..P06 (sırayla) → P07   (P08–P09 tamamlandı)
             └→ P10 → P11 → P12 → P13 → P14 → P15 → P16
P16 ve P07 tamamlandıktan sonra:
  P17 → P19 → P20 → P21 → P22 → P18 (Replay, kapı verisine bağlı) → P23 → P24 … P31
  (P24–P27 kendi aralarında bağımsız)
→ P32 → P33 → P34 → P35 → P36 → P37 → P38
```
P10–P13, P03–P07 ile paralel yürüyebilir (iki ayrı model ya da oturum). Diğer her şey sıralıdır.

## Model rehberi
- Flash/haiku sınıfı: P00–P07, P10–P13, P17, P19, P21, P23, P28, P31, P33, P35, P37.
- Daha güçlü model önerilir (mantık ya da karar yoğun): P14–P16 (mimari ve silme), P18 (kaydırmalı anlatı), P22 (artifact üretimi), P25, P29–P30 (3D motor), P32, P36, P38.
