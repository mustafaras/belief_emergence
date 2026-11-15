# Uygulama v2: Analiz, Ürün ve Tasarım Planı

Tarih: 2026-11-15 · Kapsam: `repo/` · Uygulama adımları: `docs/APP_V2_EXECUTION_PROMPTS.md`

**Referans makale sürümü.** `paper/main/main.tex`, son commit `61231d7` (2026-11-11). Belgelerde kayıtlı
en yüksek ve en son puan bu sürüme ait: **95/100** (`docs/ROADMAP_TO_SUBMISSION.md:3`). Çalışma ağacında
`paper/` değişikliği yok. Uygulama bu sürümü yansıtır. Makalenin iç çelişkileri (§6) sayıları artifact'a
bağlayarak giderilir; makalenin iddiaları ve anlatısı değiştirilmez.

---

## 1. Karar: tek ürün, tek kaynak, radikal yenileme

v1'in hatası **ikilikti**: eski "Belief Emergence" parametre gezgini silinmedi, yeni denetim
panelleri onun altına eklendi. v2'de aşağıdaki üç ikiliğin hiçbiri kalmaz.

| İkilik | v1 durumu | v2 kuralı |
|---|---|---|
| **Ürün** | İki arayüz üst üste: eski gezgin ve yeni kanıt panelleri | Eski arayüz **silinir**. Tek kabuk, tek navigasyon, tek tasarım sistemi |
| **Sayı kaynağı** | Sayılar hem elle yazılmış hem artifact'tan okunuyor. Makale ile uygulama ayrı ayrı güncelleniyor | Ekranda görünen her sayı tek bir **Claim Registry** üzerinden gelir. Makaledeki `\num{}` değerleri de aynı registry'ye karşı kontrol edilir |
| **Anlatı** | Arayüz "model iyi çalışıyor" diyor, makale "denetim modeli düşürdü" diyor | Arayüz makalenin bölüm sırasını izler: Veri → Denetim → Model → Değerlendirme → Sınırlar → Geometri |

**Silinecekler** (P16'da): `TopBar`, `ModernSidebar`, `RouteNav`, `PresetModal`, `AiInterpreterModal`,
`InteractiveDocumentation`, `sections/*` (Amplifiers, Suppressors, CoreVariables, BeliefEquation,
MathematicalAnalysis, SystemDynamics, CorrelationMatrix, SectionTemplate, CoefficientProvenance),
`CountriesZValuesPanel`, `contributions/*`, `metrics/*`, `formula/*`, ilgili tüm CSS (~25.000 satır) ve
eski görsel baseline'lar.

**Korunacaklar** (yeniden kullanılır): `utils/calculateModel.ts`, `utils/modelContract.ts`,
`utils/uiToModelTransform.ts`, `utils/urlState.ts`, `utils/csv/*`, `utils/validation/*`, `evidence/*`,
`verification/*`, `data/*`, `contexts/DataContext.tsx`, `contexts/ThemeContext.tsx`,
`visualization/surface/{geometry,camera,colorScale}.ts`, `scripts/*` kapıları.

**AI Interpreter kaldırılır.** Gerekçe: makale (§7) bu modülü tekrarlanabilirlik için gereksiz sayıyor.
Statik dağıtımda zaten çalışmıyor. API anahtarını `localStorage`'da düz metin olarak tutuyor. Tutmak
ikinci bir ürün yüzeyi demek.

---

## 2. Analiz: v1'in ölçülen sorunları

Ölçüm: 2026-11-15, headless Chrome, 1440×900 ve 390×844, `tests/visual-baselines/*`, kaynak tarama.

### 2.1 Makale uyumu
| # | Sorun | Kanıt |
|---|---|---|
| A1 | Başlık ve kimlik eski makaleye ait | `index.html:11` "…Macro-Urban Belief Emergence". Makale: "Measurement Validity Before Model Geometry" |
| A2 | İlk ekran geometriyle açılıyor, denetim ekranın altında | Landing: 6 model kartı ve "Mathematical Core of Belief Emergence" |
| A3 | Ölçülemeyen C, D, G, S kanalları canlı slider olarak duruyor | `ModernSidebar.tsx:1014,1044,1108,1123`. `DEFAULT_PARAMS.C=2.614` |
| A4 | Amplifier/Suppressor dili 338 yerde geçiyor | Makale §8 bu dili geri çekiyor |
| A5 | Doğrusal ile doyuran model karşılaştırması (0.3976 / 0.4207) ekranda yok | `functional_form_comparison` 0 bileşende okunuyor |
| A6 | Örneklem dışı sonuçlar dağılım olarak gösterilmiyor | `model_ladder_metrics`, `prediction_interval_coverage`, `parameter_stability`, `failure_log`, `coefficient_fit` 0 bileşende okunuyor |
| A7 | "Statistical Analysis" panelinin manşet değeri slider çıktısı (Z=0.6910), uyum istatistiği değil | ekran görüntüsü |
| A8 | Ülke tablosu makaledeki tabloyla uyuşmuyor | AUS: uygulamada 0.823, `main.tex:866`'da 0.174 |
| A9 | Gini penceresi, sıfır-doldurma, Bonferroni ve R'yi çıkarma bulguları hiç gösterilmiyor | artifact'ları 0 bileşende okunuyor |
| A10 | "Orijinal panelde 4/4 kapı düştü" anlatısı gösterilmiyor | — |
| A11 | README'de eski metrikler (R² 0.8461, N=630, 23 ülke) | 31 eşleşme |
| A12 | AI Interpreter statik dağıtımda çalışmıyor, anahtarı düz metin saklıyor | `AiInterpreterModal.tsx:42,118` |

### 2.2 Görsel ve UX
| # | Sorun |
|---|---|
| B1 | Üst araç çubuğu başlığın üstüne biniyor |
| B2 | 6 kart tek satıra sıkışmış, metinler kesiliyor |
| B3 | Route navigasyonu sayfanın ortasında duruyor ve tabloyu örtüyor |
| B4 | Aynı sayfada açık ve koyu tema karışık; sidebar metni devre dışı gibi soluk |
| B5 | Belge seviyesinde kaydırma yok, iç içe kaydırma kapları var |
| B6 | Analiz route'larında ekranın yaklaşık %60'ı boş |
| B7 | Bazı route'lar görsel olarak landing ile aynı |
| B8 | Mobil kullanılamaz |
| B9 | Tablo sağdan taşıyor |
| B10 | Preset modalında adlar kesiliyor ve ham `$Z$` görünüyor |
| B11 | 7–9px etiketler okunaksız |
| B12 | Bilgi mimarisi makalenin değil, kodun yapısını izliyor |

### 2.3 Kök nedenler
1. Sayılar için tek kaynak yok. Her bileşen kendi değerini kendisi okuyor ya da kendisi yazıyor.
2. Tasarım sistemi yok: 20 CSS dosyası ve 24.000+ satır yerel değer.
3. Görsel testler hatalı düzeni referans almış; mobil ve tema testi yok.
4. Yeni içerik eskinin üstüne eklendi, eskisi silinmedi.

---

## 3. Ürün vizyonu

> **"The Audit, Interactive."** Okuyucu makalenin iddialarını makaledeki sırayla görür. Her sayının
> kaynağını tek tıkla açar. Makalenin karar noktalarını (reliability eşiği, Gini penceresi, seed,
> Bonferroni, R'yi çıkarma) kendisi değiştirip sonucun neden raporlandığı gibi olduğunu görür.

Referans çıta: Distill.pub'ın editoryal derinliği, Our World in Data'nın şeffaflığı, Stripe ve Linear'ın
arayüz cilası.

### 3.1 Üç ayırt edici özellik
1. **Claim Inspector.** Ekrandaki her sayı tıklanabilir. Açılan popover'da şunlar görünür: değer, artifact
   dosyası, JSON yolu, üreten script, üretim tarihi, makaledeki yeri (§ ve satır) ve "artifact'ta aç".
   Makale ile uygulama arasındaki köprü budur.
2. **Audit Replay** (landing). Kaydırmayla ilerleyen 4 adım. Okuyucu orijinal paneli görür: dört kapı
   da kırmızı, r=1.000000000000. Her adımda bir kapı düzelir; sonunda yeniden kurulan panel ve gerçek
   sonuç ortaya çıkar: başa baş.
3. **Decision Lab'lar.** Makalenin 7 karar noktası birer etkileşimli kontrol olarak sunulur. Her
   kontrolün yanında "makalenin seçimi" işaretlidir ve "neden bu seçildi" açıklaması durur.

### 3.2 Bilgi mimarisi
URL sözleşmesi `?v=<route>` ve state parametreleri (mevcut `urlState.ts`).

| § | Route | Başlık (UI, EN) | Makale | Bölümler | Etkileşim |
|---|---|---|---|---|---|
| — | `overview` | Measurement Validity Before Model Geometry | Abstract, §1 | Hero, 4 bulgu, Audit Replay, "How to read this" | Kaydırmalı anlatı, bulgu kartlarından bölümlere |
| 1 | `data` | Data & Support | §3, §4 Step 2b–2d | Funnel 442,026 → 305 → 287 → 207; değişken bazında engelleyiciler; ülke×yıl destek ısı haritası | Gini penceresi (exact/±1/±2/±3/±5); zero-fill on/off |
| 2 | `audit` | Construct Audit | §4 Step 1–2, Tablo 1 | Construct tablosu; madde korelasyon matrisi (C, D); eksik maddeler (S) | Reliability eşiği slider'ı 0.50–0.90 (makale: 0.70) |
| 3 | `gates` | Design Gates | §4 Step 3–4, Ordering | 4 kapı kartı; A006 kök neden diyagramı | Original ↔ Rebuilt anahtarı |
| 4 | `model` | The Model | §5 | Denklemler (KaTeX); Φ terim haritası (C, D, G, S kilitli); katsayı tablosu; tahmin sayısı | Terim hover'ı ile katsayı ve kaynak |
| 5 | `evaluation` | Evaluation | §6, §8 KF-0, KF-III | **Linear vs Bounded** (hero grafik); Tier dağılımı (100 fold); LOO per-fold ve pooled; rolling-origin; coverage; calibration | Protokol sekmeleri; seed seçici |
| 6 | `limits` | What This Model Cannot Show | §6 Collinearity, §8 KF-I, Multiplicity, Lockbox | Profil olabilirliği; sınır kaydırma; VIF; R'yi çıkarma; lockbox kapsamı; 2006 aykırı yılı | Bonferroni on/off; "Drop R" karşı-olgusu ve neden yapılmadığı |
| 7 | `countries` | Countries | Tablo `preset-country-z`, failure log | Sıralanabilir ve aranabilir tablo; ülke detay çekmecesi | Ülke seçimi; "Open in Geometry Lab" |
| 8 | `geometry` | Geometry Lab | §5 Şekil 1–2, §7 | 3D yüzey; (Φ,s) ısı haritası; Z(1−Z) eğrisi; destek katmanı | X, Y, M, T, E, R slider'ları; Capture A/B ve karşılaştırma; dışa aktarma |
| 9 | `reproduce` | Evidence & Reproducibility | §1 madde 4–6 | Artifact indeksi; CI kapıları; provenance zinciri; komutlar | JSON görüntüleyici; filtre |
| — | `glossary` | Notation | Tablo S15 | Sembol sözlüğü | Arama |

Eski route'lar (`component-analysis`, `field-dynamics`, `statistical-analysis`, `sensitivity-analysis`,
`emergence-analysis`, `model-diagnostics`, `advanced-parameters`, `phi-contributions`, `presets`,
`documentation`, `ai-interpreter`) `REDIRECTS` tablosuyla yeni route'lara yönlendirilir.

### 3.3 Ekran şemaları

**Kabuk (≥1024px)**
```
┌──────────────────────────────────────────────────────────────────────┐
│ ◆ Measurement Validity…   [⌘K Search]        [Paper PDF] [◐] [Share] │ 56px sticky, blur
├───────────────┬──────────────────────────────────────────────────────┤
│ CONTENTS      │  §2  CONSTRUCT AUDIT                                 │
│ ○ Overview    │  Three of four constructs fail.        ← H1 serif 40 │
│ ● 2 Audit ▸   │  Lede paragraph (prose 680px)                        │
│ ○ 3 Gates     │  ┌─ Figure 2.1 ──────────────────────── wide 960 ─┐ │
│ …             │  │ [chart / table]                                 │ │
│ ▔▔▔▔▔ 34%     │  │ Data scope · Method · Boundary   [src: …json ▸] │ │
│ 248px sticky  │  └─────────────────────────────────────────────────┘ │
│ scroll-spy    │  ← Data & Support                   Design Gates →   │
└───────────────┴──────────────────────────────────────────────────────┘
```
**Mobil (<768px):** başlık çubuğu 52px; TOC sol çekmecede; içerik tek sütun, 16px kenar boşluğu;
tablolarda ilk sütun sabit ve yatay kaydırma; grafikler genişliğe uyar ve dokunma hedefi en az 44px.

**Overview hero**
```
RESEARCH ARTIFACT · Interactive companion
Measurement Validity Before Model Geometry
A reproducible audit of bounded response models
[ 3 of 4 ]          [ r = 1.000000000000 ]     [ 0.4207 vs 0.3976 ]    [ α ≤ 0.03 ]
constructs failed   outcome = predictor        bounded ≈ linear OOS     exponent not identified
→ Audit             → Gates                    → Evaluation             → Limits
```

---

## 4. Tasarım sistemi: "Editorial Precision"

### 4.1 Tipografi (self-hosted, `@fontsource`)
| Rol | Font | Boyut / satır yüksekliği |
|---|---|---|
| Display / H1 | Source Serif 4 (600) | 40/48, mobilde 30/38, letter-spacing −0.01em |
| H2 | Source Serif 4 (600) | 28/36 |
| H3 | Inter (600) | 18/26 |
| Gövde (prose) | Source Serif 4 (400) | 18/30, en fazla 68ch |
| UI | Inter (400/500) | 14/20 |
| Etiket / eyebrow | Inter (600), büyük harf, +0.08em | 12/16 (**12px altı yasak**) |
| Sayı / kod | JetBrains Mono (400), `tabular-nums` | 13–15 |

### 4.2 Renk token'ları
| Token | Light | Dark |
|---|---|---|
| `--bg` | #FAFAF7 | #0D0F12 |
| `--surface` | #FFFFFF | #14171C |
| `--surface-2` | #F3F3EF | #1B1F25 |
| `--ink` | #15171A | #E9EBEE |
| `--ink-2` | #4A4F57 | #A9AFB8 |
| `--ink-3` | #747A83 | #7D848E |
| `--line` | #E4E4DE | #262B33 |
| `--accent` | #2F43C8 | #8E9BFF |
| `--pass` | #1A7F4B | #4CC38A |
| `--withdrawn` | #B42318 | #F97066 |
| `--unidentified` | #B54708 | #FDB022 |
| `--exploratory` | #6941C6 | #B692F6 |
| `--focus` | #2F43C8 (2px ring + 2px offset) | #8E9BFF |

**Veri renkleri:** bounded model `--accent`; linear baseline #667085 / #98A2B3; Tier A #0E9384,
Tier B `--accent`, Tier C #DC6803 (keşif amaçlı). Sıralı skalada viridis kullanılır. Tüm renk
çiftleri WCAG AA kontrastı sağlamalı (metin ≥ 4.5:1, grafik öğesi ≥ 3:1).

### 4.3 Aralık, ızgara, yükseklik
4px tabanlı aralık skalası: 4 · 8 · 12 · 16 · 24 · 32 · 48 · 64 · 96. Genişlikler: prose 680, wide 960,
full 1200. Köşe yarıçapı 6 / 10 / 14. Gölge: `0 1px 2px rgba(16,24,40,.06), 0 1px 3px rgba(16,24,40,.08)`.
Koyu temada gölge yerine kenar çizgisi kullanılır.

### 4.4 Hareket
Süreler 120 / 200 / 320 ms, easing `cubic-bezier(.2,.8,.2,1)`. Sayı değişiminde 300ms tween. Grafik
geçişleri 250ms. `prefers-reduced-motion` açıksa animasyon olmaz. Kaydırmalı anlatı `IntersectionObserver`
ile çalışır, scroll-jacking yapılmaz.

### 4.5 Bileşen kiti (`src/ui/`)
`Button` (primary/secondary/ghost, sm/md), `IconButton`, `Badge` (pass/withdrawn/unidentified/exploratory/neutral; ikon ve metin birlikte), `Card`,
`Tabs`, `SegmentedControl`, `Slider` (tick'ler ve "paper" işareti), `Toggle`, `Popover`, `Tooltip`,
`DataTable` (sabit ilk sütun, sıralama, sayıları sağa hizalama), `Callout` (info/caution/finding),
`SectionHeader` (eyebrow, H1, lede), `FigureFrame` (numara, başlık, gövde, 3 satırlık caption,
kaynak çipi), `Num` (registry'den gelen sayı; noktalı alt çizgi ve inspector), `Kbd`, `Skeleton`,
`ErrorState`, `Drawer`, `CommandPalette`.

### 4.6 Grafik kiti (`src/charts/`, SVG + d3-scale/d3-shape/d3-array)
`Axis`, `CompareBars` (iki model × üç metrik), `DistStrip` (fold noktaları, IQR kutusu, medyan),
`LineProfile` (eğri, eşik çizgisi, CI bandı), `Heatmap` (sıralı skala ve lejant), `Funnel`,
`HexScatter` (gözlenen-tahmin), `Calibration` (desil), `Gauge`-tipi bileşen yok. Hepsi:
responsive (`ResizeObserver`), erişilebilir (`<title>`, `<desc>`, gizli veri tablosu), tema
token'larıyla renklenir ve tooltip'inde `Num` kullanır.

### 4.7 Durumlar
Her bölüm için loading (skeleton), error (artifact okunamadı: dosya adı ve "this is a build defect"
mesajı) ve empty durumları tanımlıdır. **Sessiz yedek değer yasaktır.**

---

## 5. Mimari

```
src/
  app/        AppShell.tsx, routes.ts, redirects.ts, useRoute.ts
  claims/     registry.ts (ClaimId → {get, format, artifact, path, paperRef})
              selectors/<domain>.ts, format.ts, ClaimInspector.tsx
  ui/         bileşen kiti (bileşen + .module.css + test)
  charts/     grafik kiti
  sections/   overview/ data/ audit/ gates/ model/ evaluation/ limits/
              countries/ geometry/ reproduce/ glossary/
  design/     tokens.css, fonts.ts, reset.css
  (korunan) utils/ evidence/ verification/ data/ contexts/
```
**Kurallar:** bileşenler sayıyı yalnızca `<Num id=…/>` ya da `useClaim(id)` ile alır. Stil CSS Modules
ve token'larla yazılır; ham hex ya da px kullanılmaz (stylelint kuralı). Dosya en fazla 400 satır,
fonksiyon en fazla 50 satır. Her bölüm `React.lazy` ile yüklenir. Plotly yalnızca `geometry` içinde
kullanılır.

**Registry ve makale senkronu:** `scripts/check_paper_claims.ts`, `main.tex` içindeki `\num{…}`
değerlerini registry'deki `paperRef` eşleşmeleriyle karşılaştırır ve `docs/PAPER_SYNC_REPORT.md`
dosyasını üretir. CI'da bir uyumsuzluk varsa kapı düşer.

---

## 6. Makale iç çelişkileri (P08–P09 girdisi; satırlar `main.tex`)

| # | Satır | Çelişki |
|---|---|---|
| P1 | 262/265/267 | 66 ülke / $\mathcal I_{23}$ / $\mathcal I_{48}$; panel 83 ülke |
| P2 | 268 | "167 also carry" ile "These 207 rows" |
| P3 | 301, 313 | Funnel şekli 167 ve 87 diyor, "scenario replication" etiketi var |
| P4 | 414 / 419–422 | ±5 benimsendi (tablo) ile ±2 benimsendi (metin); 87 ile 102 |
| P5 | 444 | "falls from 0.2869 to 0.3461" (bu bir artış) |
| P6 | 458–460 | 30 hücre ve "remaining 137" ile "42 cells" |
| P7 | 538 | "n=49" |
| P8 | 608 / 652–659 | "no penalty" ile ridge'li bileşik kayıp; sınırlar çelişiyor |
| P9 | 725 / 931 | 15.18 ile 18.82 |
| P10 | 734 / 741 | 48 ile 70 fold |
| P11 | 761 / 766 | 0.4056 ile 0.3853 |
| P12 | 768, 773, 783, 957 | "167 country-years" ifadesi 207 satırlık sonuç için |
| P13 | 796 | Countries (N) = 66 |
| P14 | 822 / 917 | p=0.055 ile p=0.081 |
| P15 | 919–923 | Paragraf iki kez yazılmış |
| P16 | 842–855 | Tabloda C, D, G, S satırları var, metin yok diyor |
| P17 | 866–888 | Preset tablosu bayat |
| P18 | 860 | "167 unique support" |
| P19 | 945 | 207 ile 167 "coincide" |
| P20 | 196 | Anahtar kelimeler eski çerçevede (düşük öncelik) |
| P21 | 719 | "Density overlays" vaadi P29 ile karşılanır |

**Kural:** yalnızca sayılar ve tekrarlar düzeltilir. İddia ve anlatı değişmez; 95/100'lük sürümün
argümanı korunur. Her düzeltme `PAPER_SYNC_REPORT.md`'ye kaydedilir.

---

## 7. Fazlar ve promptlar

| Aşama | Promptlar | İçerik | Süre |
|---|---|---|---|
| 0 Hazırlık | P00–P01 | Branch, baseline, bağımlılıklar | 0.5 g |
| 1 Tek kaynak | P02–P09 | Claim Registry, makale senkronu | 3 g |
| 2 Tasarım sistemi | P10–P13 | Token'lar, fontlar, UI kiti, grafik kiti, kit galerisi | 3 g |
| 3 Kabuk | P14–P16 | AppShell, ⌘K, Inspector, eski arayüzün silinmesi | 2 g |
| 4 Bölümler | P17–P31 | 11 bölüm | 8 g |
| 5 Dışa aktarma ve belgeler | P32–P34 | Kanıt paketi PDF, README, makale ekran görüntüleri | 1.5 g |
| 6 Kalite | P35–P38 | Düzen kontrolleri, a11y/E2E, görsel baseline'lar, bütçe ve son kapı | 2 g |

Toplam yaklaşık **20 iş günü**. Her prompt bir commit; her aşama sonunda `npm run ci:gate` yeşil olmalı.

---

## 7b. P00'dan önce tamamlananlar (2026-11-15)

- Makale, highlights, cover letter ve supplementary sayıları artifact'lara bağlandı; 38 tutarlılık bloğu (`npm run check:manuscript-consistency`). Ayrıntı: `docs/PAPER_SYNC_REPORT.md`.
- Altı yeni üretici: `generate:marginal-effects`, `generate:preset-alignment`, `generate:supplement-tables`, `generate:coefficient-bootstrap`, `generate:window-sensitivity`, `generate:data-figures`; `generate:functional-form` eşleştirilmiş fold farkıyla genişletildi.
- Veriye bağlı şekiller (Şekil 1, S1, S2, S5, A2, A3) eski modelden/panelden yeniden üretildi.
- AI Interpreter makaleden kaldırıldı.
- Yeni bilimsel bulgular: bkz. `docs/KNOWN_ISSUES.md` KI-17 (eşleştirilmiş fark), KI-18 (X/Y pencere ve Z çapa tutarsızlığı; kırpmasız refit'te α, β yine sınırda).

## 8. Bitti tanımı
- A1–A12 ve B1–B12 kapalı ve her biri otomatik bir kontrolle korunuyor.
- P1–P21 çözülmüş; `check:paper-claims` 0 uyumsuzluk veriyor.
- `src/components/` dizini yok, eski CSS yok, eski route'lar yönlendiriliyor.
- 390 / 768 / 1440 × light / dark: taşma 0, çakışma 0, 12px altı metin 0, axe ihlali 0.
- İlk JS ≤ 350 KiB gzip (geometri hariç); FCP medyanı ≤ 1500 ms; LCP ≤ 2500 ms.
- Yeni kodda kapsam ≥ %80; E2E yolculukları (hakem, replikasyoncu, kâşif, mobil) yeşil.
- Supplementary'deki UI ekran görüntüleri yeni arayüzden otomatik üretilmiş.
