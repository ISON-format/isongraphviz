"""Mutant switch: the reference consults on(name) at the places each mutant changes."""
_ACTIVE = set()


def set_active(names):
    _ACTIVE.clear()
    _ACTIVE.update(names)


def on(name):
    return name in _ACTIVE


def active():
    return set(_ACTIVE)
