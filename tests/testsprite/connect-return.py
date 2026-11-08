# Contract test: connect-return is the one open function by design (Stripe's onboarding sends
# the browser here with no token): GET answers a constant bounce into the app, any other method
# is a 4xx, and nothing from the request is reflected. Sends no secret.
import re

import requests

# The one staging address; tests/testspriteGate.test.mjs holds it equal to STAGING_REF.
BASE_URL = "https://zzkumxcjtbqoselzptig.supabase.co/functions/v1"
URL = f"{BASE_URL}/connect-return"

OK = {200}
CLIENT_ERROR = set(range(400, 500)) - {404}  # 404 = nothing deployed at this path: never a pass
PROBE = "contract<probe>7f3a"
SECRET_SHAPE = re.compile(r"\bsk_|whsec_|eyJ")
failures = []


def check(name, method, allowed, headers=None, **kwargs):
    try:
        r = requests.request(method, URL, headers=headers or {}, timeout=30, allow_redirects=False, **kwargs)
    except requests.RequestException as err:
        failures.append(f"{name}: request failed ({type(err).__name__})")
        return None
    if r.status_code not in allowed:
        failures.append(f"{name}: got {r.status_code}")
    if SECRET_SHAPE.search(r.text):
        failures.append(f"{name}: the response body carries a secret-shaped string")
    return r


page = check("GET with no token answers the bounce page", "GET", OK)
if page is not None and "brazos://payouts?from=" not in page.text:
    failures.append("GET: the page does not bounce into brazos://payouts")
check("GET ?refresh=1 answers the bounce page", "GET", OK, params={"refresh": "1"})
reflected = check("GET with a probe query answers the bounce page", "GET", OK, params={"refresh": PROBE})
if reflected is not None and ("probe" in reflected.text or "7f3a" in reflected.text):
    failures.append("GET: the page reflects a query value")
check("POST is a 4xx", "POST", CLIENT_ERROR, json={})
check("PUT is a 4xx", "PUT", CLIENT_ERROR)

assert not failures, "\n".join(failures)
