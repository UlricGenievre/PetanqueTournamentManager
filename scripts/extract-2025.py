"""Extrait le tournoi 2025 de l'Excel historique vers un JSON de test, avec des noms de clubs anonymisés.

Usage : python3 -I scripts/extract-2025.py "3.Tableau résultats 2025.xlsx" sortie.json

La correspondance noms réels → noms fictifs est conservée dans l'onglet « Anonymisation » de l'Excel
(qui reste hors du dépôt). S'il n'existe pas, des noms fictifs sont tirés au hasard et l'onglet est ajouté.
Bibliothèque standard uniquement (un .xlsx est une archive zip de XML).
"""
import json
import os
import random
import re
import shutil
import tempfile
import sys
import zipfile
import xml.etree.ElementTree as ET

NS = {
    "m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main",
    "r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
}


def read_workbook(path):
    z = zipfile.ZipFile(path)
    shared = []
    if "xl/sharedStrings.xml" in z.namelist():
        for si in ET.fromstring(z.read("xl/sharedStrings.xml")).findall("m:si", NS):
            shared.append("".join(t.text or "" for t in si.iter("{%s}t" % NS["m"])))
    wb = ET.fromstring(z.read("xl/workbook.xml"))
    rels = {r.get("Id"): r.get("Target") for r in ET.fromstring(z.read("xl/_rels/workbook.xml.rels"))}
    sheets = {}
    for s in wb.find("m:sheets", NS):
        target = rels[s.get("{%s}id" % NS["r"])].lstrip("/")
        target = target if target.startswith("xl/") else "xl/" + target
        cells = {}
        for c in ET.fromstring(z.read(target)).iter("{%s}c" % NS["m"]):
            if c.get("t") == "inlineStr":
                cells[c.get("r")] = "".join(t.text or "" for t in c.iter("{%s}t" % NS["m"]))
                continue
            v = c.find("m:v", NS)
            if v is None:
                continue
            cells[c.get("r")] = shared[int(v.text)] if c.get("t") == "s" else v.text
        sheets[s.get("name")] = cells
    return sheets


def col_index(letters):
    n = 0
    for ch in letters:
        n = n * 26 + ord(ch) - 64
    return n


def col_letters(n):
    s = ""
    while n:
        n, r = divmod(n - 1, 26)
        s = chr(65 + r) + s
    return s


FAKE_CLUBS = [
    "VALCOMBE", "BRUSSAGUE", "MIRANDOL", "CASTELBRUN", "SAINT-ORIEL", "LACOSTEL", "PEYRAGUE",
    "FONTAUBE", "ROQUELAIR", "BELMONTAGNE", "SERVIAC", "LOUBIGNAC", "MAURAZET", "CAUSSINAC",
    "LAGRAULIE", "VERDALON", "CAMBELOUX", "ARGENTAL", "BOUSQUET-LE-HAUT", "TERRASSOL",
    "SAINT-JUST-DES-PINS", "LAFFITAU", "MONTBRESSAC", "CAZAUBIL", "PRADELOUP", "ESCALDOU",
]
MAPPING_SHEET = "Anonymisation"
MAPPING_HEADER = ["N°", "Équipe (nom réel)", "Équipe (nom anonymisé)", "Club réel", "Club anonymisé"]


def club_of(name):
    return re.sub(r"\s+\d+$", "", name)


def new_mapping(teams):
    """Tire un nom fictif par club ; « VALCOMBE 1 » et « VALCOMBE 2 » gardent le même club fictif."""
    clubs = sorted({club_of(t["name"]) for t in teams})
    fakes = random.sample(FAKE_CLUBS, len(clubs))
    by_club = dict(zip(clubs, fakes))
    rows = []
    for t in teams:
        real_club = club_of(t["name"])
        suffix = t["name"][len(real_club):]
        rows.append([t["number"], t["name"], by_club[real_club] + suffix, real_club, by_club[real_club]])
    return rows


def read_mapping(cells):
    rows = []
    r = 2
    while cells.get(f"A{r}") is not None:
        rows.append([num(cells[f"A{r}"])] + [cells.get(f"{c}{r}") for c in "BCDE"])
        r += 1
    return rows


def xml_escape(text):
    return str(text).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace('"', "&quot;")


def append_mapping_sheet(path, rows):
    """Ajoute l'onglet de correspondance à l'Excel sans toucher au reste du classeur."""
    z = zipfile.ZipFile(path)
    files = {n: z.read(n) for n in z.namelist()}
    infos = {n: z.getinfo(n) for n in z.namelist()}
    z.close()

    numbers = [int(m.group(1)) for n in files if (m := re.fullmatch(r"xl/worksheets/sheet(\d+)\.xml", n))]
    sheet_file = f"sheet{max(numbers) + 1}.xml"
    workbook = files["xl/workbook.xml"].decode("utf-8")
    rels = files["xl/_rels/workbook.xml.rels"].decode("utf-8")
    sheet_id = max(int(x) for x in re.findall(r'sheetId="(\d+)"', workbook)) + 1
    rel_id = "rId" + str(max(int(x) for x in re.findall(r'Id="rId(\d+)"', rels)) + 1)

    def cell(ref, value):
        if isinstance(value, (int, float)):
            return f'<c r="{ref}"><v>{value}</v></c>'
        return f'<c r="{ref}" t="inlineStr"><is><t>{xml_escape(value)}</t></is></c>'

    body = []
    for i, row in enumerate([MAPPING_HEADER] + rows, start=1):
        body.append(f'<row r="{i}">' + "".join(cell(f"{col_letters(j + 1)}{i}", v) for j, v in enumerate(row)) + "</row>")
    files[f"xl/worksheets/{sheet_file}"] = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
        '<cols><col min="1" max="1" width="6" customWidth="1"/><col min="2" max="5" width="28" customWidth="1"/></cols>'
        f'<sheetData>{"".join(body)}</sheetData></worksheet>'
    ).encode("utf-8")
    files["xl/workbook.xml"] = workbook.replace(
        "</sheets>", f'<sheet name="{MAPPING_SHEET}" sheetId="{sheet_id}" r:id="{rel_id}"/></sheets>'
    ).encode("utf-8")
    files["xl/_rels/workbook.xml.rels"] = rels.replace(
        "</Relationships>",
        f'<Relationship Id="{rel_id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/{sheet_file}"/></Relationships>',
    ).encode("utf-8")
    content_types = files["[Content_Types].xml"].decode("utf-8")
    files["[Content_Types].xml"] = content_types.replace(
        "</Types>",
        f'<Override PartName="/xl/worksheets/{sheet_file}" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>',
    ).encode("utf-8")

    fd, tmp = tempfile.mkstemp(suffix=".xlsx", dir=os.path.dirname(os.path.abspath(path)))
    os.close(fd)
    with zipfile.ZipFile(tmp, "w", zipfile.ZIP_DEFLATED) as out:
        for name, data in files.items():
            info = infos.get(name)
            out.writestr(info if info else name, data, compress_type=zipfile.ZIP_DEFLATED)
    shutil.copymode(path, tmp)
    os.replace(tmp, path)


def num(v):
    if v is None or str(v).strip() == "":
        return None
    f = float(v)
    return int(f) if f.is_integer() else f


def clean(name):
    return re.sub(r"\s+", " ", name).strip()


def main(src, dst):
    sheets = read_workbook(src)
    res = sheets["Résultats"]

    teams = []
    row = 4
    while res.get(f"B{row}") is not None:
        teams.append({"number": num(res[f"B{row}"]), "name": clean(res[f"C{row}"])})
        row += 3

    rounds = []
    for sheet, first in (("Matin", 1), ("Aprem", 5)):
        cells = sheets[sheet]
        for block, start in enumerate(("B", "K", "T", "AC")):
            c0 = col_index(start)
            col = lambda k: col_letters(c0 + k)
            matches = []
            for r in range(5, 60, 2):
                a, b = cells.get(f"{col(0)}{r}"), cells.get(f"{col(7)}{r}")
                if a is None or b is None:
                    continue
                matches.append({
                    "teamA": num(a),
                    "teamB": num(b),
                    "pointsA": num(cells.get(f"{col(2)}{r}")),
                    "scoreA": num(cells.get(f"{col(3)}{r}")),
                    "scoreB": num(cells.get(f"{col(4)}{r}")),
                    "pointsB": num(cells.get(f"{col(5)}{r}")),
                })
            rounds.append({"number": first + block, "matches": matches})

    cls = sheets["Classement"]
    ranking = []
    row = 4
    while cls.get(f"C{row}") is not None:
        ranking.append({
            "rank": num(cls.get(f"B{row}")),
            "team": num(cls[f"C{row}"]),
            "pg": num(cls.get(f"E{row}")),
            "pr": num(cls.get(f"F{row}")),
            "diff": num(cls.get(f"G{row}")),
        })
        row += 1

    if MAPPING_SHEET in sheets:
        mapping = read_mapping(sheets[MAPPING_SHEET])
    else:
        mapping = new_mapping(teams)
        append_mapping_sheet(src, mapping)
        print(f"Onglet « {MAPPING_SHEET} » ajouté à {src}")
    fake_name = {row[0]: row[2] for row in mapping}
    for t in teams:
        t["name"] = fake_name[t["number"]]

    out = {"source": "Tableau des résultats 2025 (noms de clubs anonymisés)", "teams": teams, "rounds": rounds, "excelRanking": ranking}
    with open(dst, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=1)
    print(f"{len(teams)} équipes, {[len(r['matches']) for r in rounds]} matchs par partie, {len(ranking)} lignes de classement")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
