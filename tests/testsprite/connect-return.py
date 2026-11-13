# Contract test: connect-return is the one open function by design (Stripe's onboarding sends
# the browser here with no token): GET answers a constant 302 into the app, any other method
# is a 4xx, and nothing from the request is reflected. Sends no secret.
import re

import requests

# The one staging address; tests/testspriteGate.test.mjs holds it equal to STAGING_REF.
BASE_URL = "https://zzkumxcjtbqoselzptig.supabase.co/functions/v1"
URL = f"{BASE_URL}/connect-return"

REDIRECT = {302}
RETURN = "brazos://payouts?from=return"
REFRESH = "brazos://payouts?from=refresh"
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


back = check("GET with no token answers the 302", "GET", REDIRECT)
if back is not None and back.headers.get("Location") != RETURN:
    failures.append("GET: the 302 does not send the browser to " + RETURN)
refresh = check("GET ?refresh=1 answers the 302", "GET", REDIRECT, params={"refresh": "1"})
if refresh is not None and refresh.headers.get("Location") != REFRESH:
    failures.append("GET ?refresh=1: the 302 does not send the browser to " + REFRESH)
reflected = check("GET with a probe query answers the 302", "GET", REDIRECT, params={"refresh": PROBE})
if reflected is not None:
    answer = reflected.text + (reflected.headers.get("Location") or "")
    if "probe" in answer or "7f3a" in answer:
        failures.append("GET: the answer reflects a query value")
    if reflected.headers.get("Location") != RETURN:
        failures.append("GET with a probe query: the 302 does not send the browser to " + RETURN)
check("POST is a 4xx", "POST", CLIENT_ERROR, json={})
check("PUT is a 4xx", "PUT", CLIENT_ERROR)

assert not failures, "\n".join(failures)
