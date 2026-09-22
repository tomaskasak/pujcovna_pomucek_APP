"""DOČASNÉ — jednorázově stáhne jednu fotku z webu a pošle ji appce."""

import base64
import json
import os
import urllib.parse
import urllib.request

URL = "https://reharentkrkonose.cz/wp-content/uploads/2025/08/1000001234_cb2e9e500c54c8d3ef039da2d3397035-24.-8.-2025-12_38_19-–-upraveno_20250825_163844_0000-235x300.png"
ITEM_NAME = "Vysoké chodítko"


def main():
    app_url = os.environ["APP_URL"]
    secret = os.environ["CRON_SECRET"]

    encoded_url = urllib.parse.quote(URL, safe=":/?&=%")
    with urllib.request.urlopen(encoded_url) as resp:
        raw = resp.read()
        content_type = resp.headers.get("Content-Type", "image/png")

    payload = json.dumps(
        {"itemName": ITEM_NAME, "data": base64.b64encode(raw).decode("ascii"), "contentType": content_type}
    ).encode("utf-8")
    req = urllib.request.Request(
        f"{app_url}/api/cron/seed-photo?secret={secret}",
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req) as resp:
            resp.read()
        print(f"{ITEM_NAME}: OK ({len(raw)} bajtů)")
    except urllib.error.HTTPError as e:
        print(f"{ITEM_NAME}: CHYBA {e.code} — {e.read().decode('utf-8', 'replace')}")


if __name__ == "__main__":
    main()
