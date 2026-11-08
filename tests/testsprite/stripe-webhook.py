# Contract test: stripe-webhook accepts nothing without a valid Stripe signature.
# Sends no secret. A signed delivery needs the webhook secret: out of scope for v1.
# The function runs with JWT verification off; a 401 here means the dashboard toggle was turned on.
import re
import time

import requests

# The one staging address; tests/testspriteGate.test.mjs holds it equal to STAGING_REF.
BASE_URL = "https://zzkumxcjtbqoselzptig.supabase.co/functions/v1"
URL = f"{BASE_URL}/stripe-webhook"

BAD_SIGNATURE = {400}
CLIENT_ERROR = set(range(400, 500)) - {404}  # 404 = nothing deployed at this path: never a pass
EVENT = '{"id":"evt_contract_test","type":"payment_intent.succeeded","data":{"object":{}}}'
JSON = {"Content-Type": "application/json"}
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


def signed(signature):
    return {**JSON, "Stripe-Signature": signature}


check("POST an event with no signature is a 400", "POST", BAD_SIGNATURE, headers=JSON, data=EVENT)
check("POST an event with a garbage signature is a 400", "POST", BAD_SIGNATURE, headers=signed("garbage"), data=EVENT)
check("POST an event with a stale signature is a 400", "POST", BAD_SIGNATURE, headers=signed("t=1,v1=" + "0" * 64), data=EVENT)
check("POST an event with a fresh but wrong signature is a 400", "POST", BAD_SIGNATURE, headers=signed(f"t={int(time.time())},v1=" + "0" * 64), data=EVENT)
check("POST an empty body with a wrong signature is a 400", "POST", BAD_SIGNATURE, headers=signed(f"t={int(time.time())},v1=" + "0" * 64), data="")
check("GET is a 4xx", "GET", CLIENT_ERROR)

assert not failures, "\n".join(failures)
