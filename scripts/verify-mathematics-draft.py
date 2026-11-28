"""Independent exact/enumerative checks; teacher approval is still required."""
import hashlib, itertools, json, math
from fractions import Fraction
from pathlib import Path
path=Path(__file__).resolve().parents[1]/'content/drafts/ss3-waec-mathematics-v1.json'
draft=json.loads(path.read_text())
q=draft['questions']
assert draft['status']=='draft' and draft['teacherApproval'] is None
assert len(q)==8 and len({r['id'] for r in q})==8
assert all(r['publicationStatus']=='draft' and len(r['options'])==4 and len(set(r['options'].values()))==4 for r in q)
# 1: Test each answer in the original equation (not the worked rearrangement).
valid=[key for key,value in q[0]['options'].items() if 3*(2*int(value)-1)-2*(int(value)+4)==9]
assert valid==[q[0]['correctAnswer']]
# 2: Independently enumerate integer roots, then compare both members of each option.
roots=[x for x in range(-20,21) if x*x-5*x+6==0]
assert roots==[2,3]
assert q[1]['options'][q[1]['correctAnswer']]==' and '.join(map(str,roots))
# 3: Check constant ratio y/x^2 using exact fractions.
assert Fraction(int(q[2]['options'][q[2]['correctAnswer']]),25)==Fraction(18,9)
# 4: Shoelace area of vertices (0,0),(14,0),(8,5),(0,5), not trapezium formula.
points=[(0,0),(14,0),(8,5),(0,5)]
area=abs(sum(x*points[(i+1)%4][1]-y*points[(i+1)%4][0] for i,(x,y) in enumerate(points)))/2
assert q[3]['options'][q[3]['correctAnswer']]==f'{int(area)} cm²' and area==55
# 5: Independent numeric sine and Pythagorean check.
height=10*math.sin(math.radians(30));horizontal=10*math.cos(math.radians(30))
assert math.isclose(height,5) and math.isclose(height**2+horizontal**2,100)
assert q[4]['options'][q[4]['correctAnswer']]=='5 m'
# 6: Enumerate all unordered pairs of distinct balls.
balls=['R1','R2','R3','B1','B2'];pairs=list(itertools.combinations(balls,2))
prob=Fraction(sum(a.startswith('R') and b.startswith('R') for a,b in pairs),len(pairs))
assert Fraction(q[5]['options'][q[5]['correctAnswer']])==prob==Fraction(3,10)
# 7: Zero sum of deviations verifies the proposed mean; distinguish median.
mean=Fraction(q[6]['options'][q[6]['correctAnswer']]);scores=[4,7,7,10,12]
assert sum(Fraction(x)-mean for x in scores)==0 and mean==8 and sorted(scores)[2]==7
# 8: Numeric Euclidean norm plus scaled 3-4-5 triangle check.
distance=math.dist((1,2),(7,10));assert distance==2*5==10
assert q[7]['options'][q[7]['correctAnswer']]=='10 units'
# Bind review evidence to the exact question/solution artifact.
for i,r in enumerate(q,1):
 assert len(r['explanation'])>100
 print(f'Q{i}: {r["topic"]} — calculation and option {r["correctAnswer"]} verified')
print('Answer key: '+', '.join(r['correctAnswer'] for r in q))
print('SHA-256: '+hashlib.sha256(path.read_bytes()).hexdigest())
print('Eight independent calculation checks passed. Teacher approval: PENDING; publication: DRAFT.')
