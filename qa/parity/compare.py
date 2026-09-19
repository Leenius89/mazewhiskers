"""Compare two recorded runs sample by sample.

    python compare.py <trace a> <trace b>
"""
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))


def load(name):
    with open(os.path.join(HERE, 'traces', name + '.json'), encoding='utf-8') as f:
        return json.load(f)


a, b = load(sys.argv[1]), load(sys.argv[2])
FIELDS = ['frame', 'phase', 'x', 'y', 'health', 'enemies', 'apartments', 'randomCalls']

print(f"{a['name']:>16} vs {b['name']}")
for key in ('bootFrames', 'createdAt', 'introFrames', 'endedAt', 'finalPhase', 'framesRun'):
    same = a[key] == b[key]
    print(f"  {key:12} {'same' if same else 'DIFF'}  {a[key]}" + ('' if same else f"  vs  {b[key]}"))

first = None
for sa, sb in zip(a['samples'], b['samples']):
    if sa != sb:
        first = (sa, sb)
        break

n = min(len(a['samples']), len(b['samples']))
if first is None and len(a['samples']) == len(b['samples']):
    print(f"  samples      same  all {n} samples identical (every 30 frames)")
else:
    print(f"  samples      DIFF  first difference:")
    sa, sb = first if first else (a['samples'][n - 1], b['samples'][n - 1])
    for field, va, vb in zip(FIELDS, sa, sb):
        mark = '  ' if va == vb else '!!'
        print(f"    {mark} {field:12} {va}  |  {vb}")
    print(f"  lengths {len(a['samples'])} vs {len(b['samples'])}")
