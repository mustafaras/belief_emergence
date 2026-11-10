"""How far a Gini borrow window must reach to cover the candidate cells."""
import csv

ROOT = __file__.rsplit('/', 2)[0]

gini = set()
with open(f'{ROOT}/rawdata/WDICSV.csv', encoding='utf-8', errors='replace') as fh:
    rd = csv.reader(fh)
    header = next(rd)
    years = {c: i for i, c in enumerate(header) if c.isdigit()}
    for row in rd:
        if len(row) > 3 and row[3] == 'SI.POV.GINI':
            for y, i in years.items():
                if i < len(row) and row[i].strip():
                    gini.add((row[1], int(y)))

panel = {(r['iso3'], r['year']) for r in csv.DictReader(open(f'{ROOT}/public/data/panel_canonical_v2.csv'))}
wvs = [(r['iso3'], str(int(float(r['year'])))) for r in csv.DictReader(open(f'{ROOT}/rawdata/wvs_combined.csv')) if r['year']]
cand = [k for k in wvs if k not in panel]

print(f'WDI Gini cells: {len(gini)}')
print(f'candidate cells: {len(cand)}')
for w in (2, 4, 6, 8, 10, 15):
    hits = sum(1 for iso, yr in cand if any((iso, int(yr) + d) in gini for d in range(-w, w + 1)))
    print(f'  window +/-{w:2}: {hits}/{len(cand)}')
