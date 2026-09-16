"""
Stáhne aktuální ceník z reharentkrkonose.cz a pošle ho appce, aby si podle
něj doplnila/aktualizovala ceny pomůcek. Appka na Renderu je při přímém
dotazu na web blokovaná ochranou WEDOS.protection, proto to za ni dělá
tahle GitHub Actions úloha (viz .github/workflows/sync-pricelist.yml).
"""

import json
import os
import re
import urllib.request

PRICELIST_URL = "https://reharentkrkonose.cz/cenik-sluzeb-pujcovna-rehabilitacnich-pomucek/"

# Kategorie appka z webu nezná, mapujeme je ručně podle názvu položky.
CATEGORY_BY_NAME = {
    "Berle": "Hole a berle",
    "Francouzské hole": "Hole a berle",
    "Chodítko (s kolečky/bez)": "Chodítka",
    "Vysoké chodítko": "Chodítka",
    "Invalidní vozík (základní)": "Vozíky",
    "Toaletní křeslo": "Toaletní křesla",
    "Zvedák pro přesun osob": "Zvedáky",
    "Antidekubitní matrace (nafukovací s kompresorem)": "Matrace",
    "Elektrický vozík": "Vozíky",
    "Schodolez pásový": "Schodolezy",
    "Motodlaha": "Motodlahy",
    "Elektrická polohovací postel": "Polohovací postele",
    "Hrazda k posteli": "Polohovací postele",
    "Antidekubitní matrace (k posteli)": "Polohovací postele",
    "BALÍČEK: Postel + matrace + hrazda": "Polohovací postele",
}

# Web u položek z druhé tabulky (postele) nepíše "(k posteli)", appka to
# tak má kvůli odlišení od matrace v první tabulce.
NAME_ALIASES = {
    "Antidekubitní matrace": "Antidekubitní matrace (k posteli)",
}


def strip_tags(html):
    return re.sub(r"<[^>]+>", "", html).replace("&nbsp;", " ").strip()


def parse_kc(text):
    digits = re.sub(r"[^\d]", "", text)
    return int(digits) if digits else 0


def parse_tables(html):
    tables = re.findall(r"<table[^>]*>([\s\S]*?)</table>", html, re.I)
    parsed = []
    for table_html in tables:
        rows = re.findall(r"<tr[^>]*>([\s\S]*?)</tr>", table_html, re.I)
        table_rows = []
        for row_html in rows:
            cells = re.findall(r"<td[^>]*>([\s\S]*?)</td>", row_html, re.I)
            if not cells:
                continue  # hlavičkový řádek (<th>), ne data
            table_rows.append([strip_tags(c) for c in cells])
        if table_rows:
            parsed.append(table_rows)
    return parsed


def motodlaha_tiers(full_text, base_rate):
    tiers = [{"days": 1, "rate": base_rate}]
    m14 = re.search(r"(\d+)\s*Kč/den.{0,40}?14\s*a\s*více\s*dní", full_text)
    if m14:
        tiers.append({"days": 14, "rate": int(m14.group(1))})
    m30 = re.search(r"(\d+)\s*Kč/den.{0,40}?měsíc\s*a\s*více", full_text)
    if m30:
        tiers.append({"days": 30, "rate": int(m30.group(1))})
    return tiers


def main():
    app_url = os.environ["APP_URL"]
    secret = os.environ["CRON_SECRET"]

    with urllib.request.urlopen(PRICELIST_URL) as resp:
        html = resp.read().decode("utf-8")

    full_text = strip_tags(html)
    tables = parse_tables(html)
    items = []

    # Tabulka 1: pomůcky s denní i měsíční sazbou.
    if len(tables) >= 1:
        for row in tables[0]:
            if len(row) < 2:
                continue
            name = NAME_ALIASES.get(row[0], row[0])
            daily_rate = parse_kc(row[1])
            if not daily_rate:
                continue
            price_tiers = (
                motodlaha_tiers(full_text, daily_rate) if name == "Motodlaha" else None
            )
            items.append(
                {
                    "name": name,
                    "category": CATEGORY_BY_NAME.get(name),
                    "dailyRate": daily_rate,
                    "priceTiers": price_tiers,
                }
            )

    # Tabulka 2: balíčky/postele jen s měsíční sazbou -> přepočet na den.
    if len(tables) >= 2:
        for row in tables[1]:
            if len(row) < 2:
                continue
            name = NAME_ALIASES.get(row[0], row[0])
            monthly = parse_kc(row[1])
            if not monthly:
                continue
            items.append(
                {
                    "name": name,
                    "category": CATEGORY_BY_NAME.get(name),
                    "dailyRate": round(monthly / 30),
                    "priceTiers": None,
                }
            )

    payload = json.dumps({"items": items}).encode("utf-8")
    req = urllib.request.Request(
        f"{app_url}/api/cron/sync-pricelist?secret={secret}",
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req) as resp:
            result = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        print(f"HTTP {e.code}: {e.read().decode('utf-8', 'replace')}")
        raise

    print(f"Nalezeno položek: {len(items)}")
    print(f"Aktualizováno: {result.get('updated')}")
    print(f"Nově přidáno: {result.get('added')}")


if __name__ == "__main__":
    main()
