# Contract test: send-receipts (woken by the database with the service key) refuses everyone else.
# Sends no secret. The service-key path is the database's own: out of scope for v1.
import re

import requests

# The one staging address; tests/testspriteGate.test.mjs holds it equal to STAGING_REF.
BASE_URL = "https://zzkumxcjtbqoselzptig.supabase.co/functions/v1"
URL = f"{BASE_URL}/send-receipts"

AUTH_REFUSED = {401, 403}
CLIENT_ERROR = set(range(400, 500)) - {404}  # 404 = nothing deployed at this path: never a pass
BOGUS = {"Authorization": "Bearer not-a-real-token"}
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


check("POST without Authorization is refused", "POST", AUTH_REFUSED)
check("POST with a bogus Bearer token is refused", "POST", AUTH_REFUSED, headers=BOGUS)
check("GET without Authorization is a 4xx", "GET", CLIENT_ERROR)
check("GET with a bogus Bearer token is a 4xx", "GET", CLIENT_ERROR, headers=BOGUS)
check("POST with an empty JSON body and a bogus token is a 4xx", "POST", CLIENT_ERROR, headers=BOGUS, json={})

assert not failures, "\n".join(failures)
