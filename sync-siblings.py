"""Copy a sim onto its siblings.

Several of these sims are the same program twice, differing only in a title
and one constant near the top of the file:

    fly_stick.html  ->  flowing_essence.html      DEFAULT_MODEL 'none' -> 'one'
                    ->  electric_induction.html   DEFAULT_MODEL 'none' -> 'two'
    rub_plastics.html -> add_stick_plastic.html   DEFAULT_STICK false -> true

Edit the first file of a family, run this, and the rest follow. It only
rewrites the two marked lines, so a diff between any pair of files in a
family stays two lines long.

    python sync-siblings.py           # write the siblings
    python sync-siblings.py --check   # say whether they are already in step
"""
import io
import os
import re
import sys

ROOT = os.path.dirname(os.path.abspath(__file__))

FAMILIES = [
    ("fly_stick.html", "DEFAULT_MODEL", [
        ("flowing_essence.html", "'one'", "The Charge Model"),
        ("electric_induction.html", "'two'",
         "Positive and Negative Charge Inside Everything"),
    ]),
    ("rub_plastics.html", "DEFAULT_STICK", [
        ("add_stick_plastic.html", "true",
         "Rubbing Plastics, with a Fun Fly Stick"),
    ]),
]


def read(name):
    with io.open(os.path.join(ROOT, name), encoding="utf-8") as fh:
        return fh.read()


def build(source, const, value, title):
    out, n = re.subn(r"(?m)^const %s = .*;$" % const,
                     "const %s = %s;" % (const, value), source)
    if n != 1:
        raise SystemExit("%s: expected one 'const %s = ...' line, found %d"
                         % (const, const, n))
    out, n = re.subn(r"<title>.*?</title>", "<title>%s</title>" % title, out,
                     count=1, flags=re.S)
    if n != 1:
        raise SystemExit("no <title> to replace")
    return out


def main():
    check = "--check" in sys.argv
    stale = []
    for src_name, const, siblings in FAMILIES:
        source = read(src_name)
        for name, value, title in siblings:
            wanted = build(source, const, value, title)
            path = os.path.join(ROOT, name)
            if check:
                if read(name) != wanted:
                    stale.append(name)
                continue
            with io.open(path, "w", encoding="utf-8", newline="\n") as fh:
                fh.write(wanted)
            print("wrote %s from %s" % (name, src_name))
    if check:
        if stale:
            print("out of step with its source: " + ", ".join(stale))
            raise SystemExit(1)
        print("every sibling is in step with its source")


if __name__ == "__main__":
    main()
