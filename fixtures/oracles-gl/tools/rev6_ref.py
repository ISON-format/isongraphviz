"""Reference logic for the rows added after design 31 rev 6 (R31-07, R31-09, R31-11 (a) and (b); R31-08 and R31-10 are
checked, not extended).  Written from design 31 rev 6 (7.2 G11/G12, 7.5 failure, 7.6 table, Release rule, Listeners, the
controller conventions, 13.2) alone.  Standard library only; no TypeScript and nothing under packages/ was read.

It builds on tools/gap_glref.py (the plan structure, the strict reader G1-G16, the readout from a plan, the executor log
helpers and the controller fake of this corpus) and replaces only the controller class `Ctl6`, which follows rev 6:

* a loss during creation (the fake's "fail":"lost") stops creation right after the getShaderParameter of arrow.vs, calls
  no getShaderInfoLog and no cleanup (the context is lost), and is reported as the closed token CONTEXT_LOST (onError, then
  reject for a failed initialize); the phase stays `created`, the listeners stay, `failure` holds the token;
* the two listeners are added once (a second initialize in `created` adds none);
* a loss event in `created` is ignored (no effect line, no phase change, no onStatus);
* after `dispose` the controller does nothing for L and R, while the context's own flag (the fake's isContextLost()) still
  follows the L and R inputs and `status().contextLost` reports that flag;
* the release rule asks the context's own flag at dispose.

The mutants K157-K172 are switchable (`mut` names the mutant; None is the reference).
"""
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)
import gap_glref as G  # noqa: E402

ATTR = {'failIfMajorPerformanceCaveat': True}


class Ctl6:
    def __init__(self, fk, mut=None):
        self.fk = fk
        self.mut = mut
        self.phase = 'created'
        self.failure = None
        self.plan = None
        self.have_ctx = False
        self.listeners = False
        self.inits = 0
        self.kept = False          # the value of contextLost at dispose (used only by mutant K167)

    # -------------------------------------------------------------- status and log helpers
    def status(self):
        lost = self.fk.lost
        if self.mut == 'K170':
            lost = self.phase == 'lost'                       # derived from the phase, not from the context
        if self.mut == 'K167' and self.phase == 'disposed':
            lost = self.kept                                  # a value kept from the dispose
        s = {'attributes': dict(ATTR), 'contextLost': lost, 'phase': self.phase}
        if self.failure:
            s['failure'] = self.failure
        return s

    def _status_line(self):
        self.fk.L('onStatus', self.phase, 1 if self.fk.lost else 0, self.failure)

    def _draw(self):
        if self.plan is not None:
            G._frame(self.fk, self.plan)
            self.fk.L('labels.draw')

    def _create(self, fail):
        """returns (ok, token, alive, lost_during)"""
        ok, tok, alive, lost = G._creation(self.fk, fail)
        return ok, tok, alive, lost

    # -------------------------------------------------------------- events
    def ev(self, op, fail=None, plan=None):
        fk, ph, mut = self.fk, self.phase, self.mut
        # the context's own flag follows the L and R inputs in every phase (a lost context is lost whoever listens)
        if op == 'L' and self.have_ctx:
            fk.lost = True
        if op == 'R' and self.have_ctx:
            fk.lost = False
        if ph == 'disposed':
            if mut == 'K168' and op == 'L':
                fk.L('preventDefault')                        # the loss handler still runs after dispose
            if mut == 'K169' and op == 'R':
                G._creation(fk, None)                         # a restore after dispose rebuilds the resources
            return
        if op == 'init':
            if ph != 'created':
                return
            self.inits += 1
            if mut == 'K166' and self.inits > 1:
                return                                        # a second initialize in created is ignored
            if (not self.listeners) or mut == 'K165':
                fk.L('addEventListener', 'webglcontextlost')
                fk.L('addEventListener', 'webglcontextrestored')
            self.listeners = True
            self.have_ctx = True
            ok, tok, alive, lost = self._create(fail)
            if ok:
                self.phase, self.failure = 'ready', None
                self._draw()
                self._status_line()
                return
            if lost:
                if mut == 'K160':
                    fk.L('getShaderInfoLog', 'arrow.vs')      # asks the driver for a log although the context is lost
                if mut == 'K161':
                    G._cleanup(fk, alive)                     # deletes on a lost context
                tok = 'COMPILE_FAILED' if mut == 'K162' else 'CONTEXT_LOST'
            else:
                G._cleanup(fk, alive)
            self.failure = tok
            fk.L('onError', 'INVALID_INPUT/INVALID_VALUE', tok)
            fk.L('reject', 'INVALID_INPUT/INVALID_VALUE', tok)
            if lost and mut == 'K163':
                self.phase = 'lost'                           # treated like a loss event
                self.failure = None
                self._status_line()
            return
        if op == 'C':
            self.plan = plan
            if ph == 'ready':
                self._draw()
            return
        if op == 'F':
            if ph == 'ready':
                self._draw()
            return
        if op == 'L':
            if ph == 'created':
                if mut == 'K171':
                    fk.L('preventDefault')
                    fk.L('labels.clear')
                    self.phase = 'lost'
                    self._status_line()
                elif mut == 'K172':
                    self._status_line()                       # onStatus without a phase change
                return
            if ph == 'ready':
                fk.L('preventDefault')
                fk.L('labels.clear')
                self.phase = 'lost'
                self._status_line()
            elif ph == 'lost':
                fk.L('preventDefault')
            elif ph == 'failed':
                fk.L('preventDefault')
                self.phase, self.failure = 'lost', None
                self._status_line()
            return
        if op == 'R':
            if ph in ('created', 'ready'):
                return
            ok, tok, alive, lost = self._create(fail)
            if ok:
                self.phase, self.failure = 'ready', None
                self._draw()
                self._status_line()
            elif lost:
                self.phase = 'lost'
                self.failure = None
                if ph == 'failed':
                    self._status_line()
            else:
                G._cleanup(fk, alive)
                self.failure = tok
                fk.L('onError', 'INVALID_INPUT/INVALID_VALUE', tok)
                if ph == 'lost':
                    self.phase = 'failed'
                    self._status_line()
            return
        if op == 'D':
            if ph == 'ready':
                for nm in ('edge', 'disc', 'arrow'):
                    fk.L('deleteBuffer', nm)
                for nm in ('edge', 'disc', 'arrow'):
                    fk.L('deleteVertexArray', nm)
                    fk.L('deleteProgram', nm)
                fk.L('getExtension', 'WEBGL_lose_context')
                fk.L('loseContext')
            elif ph in ('created', 'failed'):
                lost = fk.lost                                # the release rule: the context's own isContextLost()
                if mut == 'K164' and self.failure == 'CONTEXT_LOST':
                    lost = False
                if self.have_ctx and not lost:
                    fk.L('getExtension', 'WEBGL_lose_context')
                    fk.L('loseContext')
            if self.listeners:
                fk.L('removeEventListener', 'webglcontextlost')
                fk.L('removeEventListener', 'webglcontextrestored')
            self.kept = fk.lost
            self.phase, self.failure = 'disposed', None
            self._status_line()
            return


def run_controller(events, plans, shader_hashes, mut=None):
    fk = G.Fake(shader_hashes)
    c = Ctl6(fk, mut)
    sts = []
    for e in events:
        pl = plans[e['plan']] if e.get('plan') else None
        c.ev(e['op'], e.get('fail'), pl)
        sts.append(c.status())
    return ''.join(G.cj(l) + '\n' for l in fk.log).encode(), sts
