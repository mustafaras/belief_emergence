"""
How much within-country variation does alpha need before it is recovered?

Simulates panels with a known alpha, refits each on a fixed grid, and reports which
grid value the fit prefers. Calibrated to this paper's measured signal-to-noise
ratio: resampling the committed predictions gives a residual SD of 0.219 against an
observed SD of 0.263, so noise is added at that level rather than using a clean
synthetic panel -- a clean panel recovers alpha at any sample size, which is not
informative about this data.

Run: python3 docs/data_plan_simulation.py
"""
import numpy as np, math, sys
from scipy.optimize import minimize

def structural(v, lo, hi):
    u=min(1.0,max(0.0,(v-lo)/(hi-lo))); e=1e-4
    return e+u*(1-2*e)

TRUE=dict(phi0=0.5,alpha=0.9,beta=0.4,k=0.9,cM=0.3,cT=-0.1,cE=0.5,cR=0.2,ctr=-0.2,cyr=0.6)

def gen(n_countries, obs_per, rng):
    rows=[]
    for i in range(n_countries):
        base=dict(X=rng.uniform(0.3,0.85), Y=rng.uniform(-1.2,3.0),
                  M=rng.normal(0,1), T=rng.normal(0,1), E=rng.normal(0,1), R=rng.normal(0,1))
        for j in range(obs_per):
            r=dict(base)
            # within-country movement over time
            r['X']=np.clip(base['X']+rng.normal(0,0.06),0.22,0.95)
            r['Y']=np.clip(base['Y']+rng.normal(0,0.35),-1.46,3.43)
            r['M']=base['M']+rng.normal(0,0.4); r['T']=base['T']+rng.normal(0,0.4)
            r['E']=base['E']+rng.normal(0,0.3); r['R']=base['R']+rng.normal(0,0.3)
            xs=structural(r['X'],0.2223,0.9544); ys=structural(r['Y'],-1.4601,3.4280)
            phi=(TRUE['phi0']+TRUE['cM']*r['M']+TRUE['cT']*r['T']+TRUE['cE']*r['E']
                 +TRUE['cR']*r['R']+TRUE['ctr']*r['T']*r['R']+TRUE['cyr']*ys*r['R'])
            phi=max(-50,min(50,phi))
            num=(xs**TRUE['alpha'])*(ys**TRUE['beta'])*math.exp(phi)
            ztrue=num/(num+TRUE['k'])
            # real panel: residual sd 0.219 vs observed sd 0.263 -> noise ~ signal
            r['Z']=float(np.clip(ztrue+rng.normal(0,0.219),1e-6,1-1e-6))
            rows.append(r)
    return rows

def predict(theta, rows, alpha, beta):
    phi0=theta[0]; k=math.exp(theta[1]); cM,cT,cE,cR,ctr,cyr=theta[2:8]
    out=np.empty(len(rows))
    for i,r in enumerate(rows):
        xs=structural(r['X'],0.2223,0.9544); ys=structural(r['Y'],-1.4601,3.4280)
        phi=phi0+cM*r['M']+cT*r['T']+cE*r['E']+cR*r['R']+ctr*r['T']*r['R']+cyr*ys*r['R']
        phi=max(-50,min(50,phi))
        num=(xs**alpha)*(ys**beta)*math.exp(phi)
        out[i]=num/(num+k)
    return out

def profile_ok(rows, alpha, beta):
    z=np.array([r['Z'] for r in rows])
    target=np.clip((z-1e-6)/(1-2e-6),1e-9,1-1e-9)
    def loss(theta):
        p=np.clip(predict(theta,rows,alpha,beta),1e-9,1-1e-9)
        return float(np.mean((p-target)**2))
    b=[(-10,10),(math.log(1e-4),math.log(50)),(-5,5),(-5,5),(-5,5),(-5,5),(-5,5),(-5,5)]
    x0=np.array([0.5,math.log(0.9),0.3,-0.1,0.5,0.2,-0.2,0.6])
    lb=minimize(loss,x0,method="L-BFGS-B",bounds=b,options={"maxiter":3000})
    return lb.fun

def run(n_countries, obs_per, seeds=3):
    rng=np.random.default_rng(0)
    recovered=[]
    for s in range(seeds):
        rows=gen(n_countries,obs_per,np.random.default_rng(100+s))
        losses={a:profile_ok(rows,a,0.4) for a in (0.05,0.3,0.6,0.9,1.2)}
        best=min(losses,key=losses.get)
        recovered.append(best)
    return recovered

print(f"{'countries x obs':>18} {'total':>6}  recovered alpha (true 0.9)")
for nc,op in [(76,1),(76,2),(76,3),(76,5),(120,3),(150,5)]:
    rec=run(nc,op,seeds=2)
    print(f"{nc:>10} x {op:<5} {nc*op:>6}  {rec}")

print(f"{'design':>18} {'total':>6}  alpha recovered (true 0.9)")
for nc, op in [(76, 1), (76, 2), (76, 3), (76, 4), (76, 5), (90, 4), (100, 5)]:
    rec = run(nc, op, seeds=3)
    print(f"{nc:>10} x {op:<5} {nc * op:>6}  {rec}")
