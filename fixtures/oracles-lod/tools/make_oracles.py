#!/usr/bin/env python3
"""IGLOD/1 independent oracle generator (Python standard library only). Writes ../EXPECT.tsv and every vector file."""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import gen_infra as gi
import g_wam, g_cnps, g_elt, g_b, g_z

def main():
    g_wam.run_w()
    g_wam.run_a()
    g_wam.run_m()
    g_cnps.run_c()
    g_cnps.run_n()
    g_cnps.run_p()
    g_cnps.run_s()
    g_elt.run_e()
    g_elt.run_l()
    g_elt.run_t()
    g_elt.run_r()
    g_elt.run_d()
    g_b.run_b()
    g_z.run_z()
    g_z.run_extras()
    g_b.write_generated()
    gi.write_manifest()
    if len(sys.argv) > 2 and sys.argv[1] == '--materialize':
        g_b.materialize(sys.argv[2])
    print(len(gi.ROWS), "rows")

if __name__ == "__main__":
    main()
