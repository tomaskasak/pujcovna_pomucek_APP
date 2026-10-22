"""DOČASNÉ — pošle fotky ze scripts/photos appce (čeká, až bude nasazená dočasná cesta)."""
import base64, json, os, sys, time, urllib.error, urllib.request

PHOTOS = [
    ("schodolez.webp", "Schodolez pásový"),
    ("zvedak.webp", "Zvedák pro přesun osob"),
    ("choditko-kolecka.webp", "Chodítko (s kolečky/bez)"),
]

# fotky, které se na serveru zkopírují z jiné pomůcky (cíl, zdroj)
COPIES = [
    ("BALÍČEK: Postel + matrace + hrazda", "Elektrická polohovací postel"),
    ("BALÍČEK: Postel + matrace + hrazda", "Antidekubitní matrace (k posteli)"),
    ("BALÍČEK: Postel + matrace + hrazda", "Hrazda k posteli"),
]

app_url, secret = os.environ["APP_URL"], os.environ["CRON_SECRET"]

def post(item_name, raw, ctype, copy_from=None):
    body = {"itemName": item_name, "data": base64.b64encode(raw).decode(), "contentType": ctype}
    if copy_from:
        body = {"itemName": item_name, "copyFrom": copy_from}
    payload = json.dumps(body).encode()
    req = urllib.request.Request(f"{app_url}/api/cron/seed-photo?secret={secret}", data=payload,
                                 headers={"Content-Type": "application/json"}, method="POST")
    with urllib.request.urlopen(req, timeout=120) as r:
        return r.read().decode()

# počkat na nasazení: dokud cesta neexistuje, server vrací obecné 404 "Nenalezeno."
for attempt in range(20):
    try:
        post("__test__", b"", "", copy_from="__test__")
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", "replace")
        if e.code == 404 and "SEED" in body:
            print(f"cesta je nasazená (pokus {attempt + 1})"); break
        print(f"pokus {attempt + 1}: zatím nenasazeno ({e.code})")
    except Exception as e:
        print(f"pokus {attempt + 1}: {e}")
    time.sleep(60)
else:
    sys.exit("cesta se nenasadila")

for fname, item in PHOTOS:
    raw = open(os.path.join(os.path.dirname(__file__), "photos", fname), "rb").read()
    try:
        print(item, "->", post(item, raw, "image/webp"), f"({len(raw)} B)")
    except urllib.error.HTTPError as e:
        print(item, "CHYBA", e.code, e.read().decode("utf-8", "replace"))

for target, source in COPIES:
    try:
        print(target, "<-", source, "->", post(target, b"", "", copy_from=source))
    except urllib.error.HTTPError as e:
        print(target, "<-", source, "CHYBA", e.code, e.read().decode("utf-8", "replace"))
