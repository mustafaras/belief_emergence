"""Which covariate blocks each recoverable World Values Survey cell."""
import csv
from collections import Counter

ROOT = __file__.rsplit('/', 2)[0]

panel = {(r['iso3'], r['year']) for r in csv.DictReader(open(f'{ROOT}/public/data/panel_canonical_v2.csv'))}
wvs = [(r['iso3'], str(int(float(r['year'])))) for r in csv.DictReader(open(f'{ROOT}/rawdata/wvs_combined.csv')) if r['year']]
macro = {}
for r in csv.DictReader(open(f'{ROOT}/rawdata/panel_model_data.csv')):
    if r['total_deaths'] or r['X_urbanization']:
        macro.setdefault((r['iso3'], r['year']), r)

COV = {'X': 'X_urbanization', 'Y': 'Y_gini', 'T': 'T_trauma_shock',
       'E': 'E_education_capacity', 'R': 'R_welfare_capacity', 'M': 'M_media_environment'}
nn = lambda x: x not in ('', None)

cand = [k for k in wvs if k not in panel]
blocked, nomacro = Counter(), 0
for k in cand:
    m = macro.get(k)
    if not m:
        nomacro += 1
        continue
    for short, col in COV.items():
        if not nn(m.get(col, '')):
            blocked[short] += 1

print(f'candidate cells: {len(cand)}')
print(f'no macro row at all: {nomacro}')
for short, n in blocked.most_common():
    print(f'  {short}: {n}')
