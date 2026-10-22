"""DOČASNÉ — pošle fotky ze scripts/photos appce (čeká, až bude nasazená dočasná cesta)."""
import base64, json, os, sys, time, urllib.error, urllib.request

PHOTOS = [
    ("francouzske-hole.webp", "Francouzské hole"),
    ("berle.webp", "Berle"),
    ("matrace-k-posteli.webp", "Antidekubitní matrace (k posteli)"),
    ("vysoke-choditko.webp", "Vysoké chodítko"),
    ("matrace-nafukovaci.webp", "Antidekubitní matrace (nafukovací s kompresorem)"),
    ("hrazda.webp", "Hrazda k posteli"),
    ("motodlaha.webp", "Motodlaha"),
]

app_url, secret = os.environ["APP_URL"], os.environ["CRON_SECRET"]

def post(item_name, raw, ctype):
    payload = json.dumps({"itemName": item_name, "data": base64.b64encode(raw).decode(), "contentType": ctype}).encode()
    req = urllib.request.Request(f"{app_url}/api/cron/seed-photo?secret={secret}", data=payload,
                                 headers={"Content-Type": "application/json"}, method="POST")
    with urllib.request.urlopen(req, timeout=120) as r:
        return r.read().decode()

# počkat na nasazení: dokud cesta neexistuje, server vrací obecné 404 "Nenalezeno."
for attempt in range(20):
    try:
        post("__test__", b"x", "image/webp")
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
