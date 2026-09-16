import re

html = open("page.html", encoding="utf-8").read()
html = re.sub(r"<script[\s\S]*?</script>", "", html, flags=re.I)
html = re.sub(r"<style[\s\S]*?</style>", "", html, flags=re.I)
html = re.sub(r"</(tr|li|p|h[1-6]|div)>", "\n", html, flags=re.I)
html = re.sub(r"<td[^>]*>", " | ", html, flags=re.I)
html = re.sub(r"<[^>]+>", "", html)
html = html.replace("&nbsp;", " ")
html = re.sub(r"\n{2,}", "\n", html).strip()
print(html)
