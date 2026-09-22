"""
DOČASNÉ — jednorázově stáhne vybrané fotky pomůcek z webu (z carouselu na
hlavní stránce) a pošle je appce k napárování na konkrétní pomůcky podle
názvu. Appka na Renderu má přímý přístup na web blokovaný (WEDOS.protection),
proto to dělá tahle GitHub Actions úloha.
"""

import base64
import json
import os
import urllib.parse
import urllib.request

# url -> přesný název pomůcky v appce
PHOTOS = {
    "https://reharentkrkonose.cz/wp-content/uploads/2025/08/1000001240_be523a158ae110934dbeede5dbb76c95-–-upraveno_20250825_163901_0000-287x300.png": "Toaletní křeslo",
    "https://reharentkrkonose.cz/wp-content/uploads/2025/08/1000001232_bcfdd962b04d6870a5afb192c2d52979-24.-8.-2025-12_38_19-–-upraveno_20250825_163856_0000-300x300.png": "Invalidní vozík (základní)",
    "https://reharentkrkonose.cz/wp-content/uploads/2025/08/1000001230_55bf3fc4a299a1decad3442d1735511e-24.-8.-2025-12_38_19-–-upraveno_20250825_163851_0000-300x254.png": "Elektrická polohovací postel",
    "https://reharentkrkonose.cz/wp-content/uploads/2025/08/1000001236_d13d82335c266afca02d80fd106d5c65-24.-8.-2025-12_38_18-–-upraveno_20250825_163848_0000-250x300.png": "Chodítko (s kolečky/bez)",
}


def main():
    app_url = os.environ["APP_URL"]
    secret = os.environ["CRON_SECRET"]

    for url, item_name in PHOTOS.items():
        # URL obsahuje ne-ASCII znak (en dash "–"), potřeba ho procentově zakódovat
        encoded_url = urllib.parse.quote(url, safe=":/?&=%")
        with urllib.request.urlopen(encoded_url) as resp:
            raw = resp.read()
            content_type = resp.headers.get("Content-Type", "image/png")

        payload = json.dumps(
            {
                "itemName": item_name,
                "data": base64.b64encode(raw).decode("ascii"),
                "contentType": content_type,
            }
        ).encode("utf-8")
        req = urllib.request.Request(
            f"{app_url}/api/cron/seed-photo?secret={secret}",
            data=payload,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        try:
            with urllib.request.urlopen(req) as resp:
                result = json.loads(resp.read().decode("utf-8"))
            print(f"{item_name}: OK ({len(raw)} bajtů)")
        except urllib.error.HTTPError as e:
            print(f"{item_name}: CHYBA {e.code} — {e.read().decode('utf-8', 'replace')}")


if __name__ == "__main__":
    main()
