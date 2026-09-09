"""Iteration 3 targeted checks for TaskFlow review request."""
import os, requests, pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
ORIG_PASSWORD = "RlDOuZVzPm-xqpfW"


@pytest.fixture(scope="module")
def owner_token():
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": "usman@taskflow.demo", "password": ORIG_PASSWORD})
    assert r.status_code == 200, r.text
    return r.json()["token"]


def auth(tok): return {"Authorization": f"Bearer {tok}"}


# ---------- Rotate access ----------
def test_rotate_requires_auth():
    r = requests.post(f"{BASE_URL}/api/admin/team/member_zain/rotate")
    assert r.status_code == 401


def test_rotate_invalidates_old_and_returns_new(owner_token):
    # Pick zain (least likely used by other tests)
    old = requests.get(f"{BASE_URL}/api/admin/team", headers=auth(owner_token)).json()
    zain = next(m for m in old if m["member_id"] == "member_zain")
    old_slug = zain["slug"]
    # Get old pin via a rotate call? we don't know old pin. Use seeded pin 5082 IF old_slug is 'zain'.
    r = requests.post(f"{BASE_URL}/api/admin/team/member_zain/rotate", headers=auth(owner_token))
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["member_id"] == "member_zain"
    assert "slug" in body and "pin" in body
    assert body["slug"] != old_slug
    new_slug, new_pin = body["slug"], body["pin"]
    # Old slug should 404
    assert requests.get(f"{BASE_URL}/api/team/{old_slug}").status_code == 404
    # New slug works
    assert requests.get(f"{BASE_URL}/api/team/{new_slug}").status_code == 200
    # Old pin (5082) rejected
    old_pin_resp = requests.post(f"{BASE_URL}/api/team/access", json={"member_id": "member_zain", "pin": "5082"})
    assert old_pin_resp.status_code == 401
    # New pin accepted
    new_pin_resp = requests.post(f"{BASE_URL}/api/team/access", json={"member_id": "member_zain", "pin": new_pin})
    assert new_pin_resp.status_code == 200


# ---------- Password change ----------
def test_password_change_requires_auth():
    r = requests.post(f"{BASE_URL}/api/auth/password", json={"current_password": "x", "new_password": "yyyyyyyy"})
    assert r.status_code == 401


def test_password_change_wrong_current(owner_token):
    r = requests.post(f"{BASE_URL}/api/auth/password", headers=auth(owner_token),
                      json={"current_password": "wrong-pw", "new_password": "newpass1234"})
    assert r.status_code == 401


def test_password_change_short(owner_token):
    r = requests.post(f"{BASE_URL}/api/auth/password", headers=auth(owner_token),
                      json={"current_password": ORIG_PASSWORD, "new_password": "short"})
    assert r.status_code == 400


def test_password_change_success_then_restore(owner_token):
    new_pw = "TempPass!2026abc"
    # Change
    r = requests.post(f"{BASE_URL}/api/auth/password", headers=auth(owner_token),
                      json={"current_password": ORIG_PASSWORD, "new_password": new_pw})
    assert r.status_code == 200, r.text
    # Old fails
    old_login = requests.post(f"{BASE_URL}/api/auth/login",
                              json={"email": "usman@taskflow.demo", "password": ORIG_PASSWORD})
    assert old_login.status_code == 401
    # New works
    new_login = requests.post(f"{BASE_URL}/api/auth/login",
                              json={"email": "usman@taskflow.demo", "password": new_pw})
    assert new_login.status_code == 200
    new_tok = new_login.json()["token"]
    # Restore
    restore = requests.post(f"{BASE_URL}/api/auth/password", headers=auth(new_tok),
                            json={"current_password": new_pw, "new_password": ORIG_PASSWORD})
    assert restore.status_code == 200
    # Verify original works again
    verify = requests.post(f"{BASE_URL}/api/auth/login",
                           json={"email": "usman@taskflow.demo", "password": ORIG_PASSWORD})
    assert verify.status_code == 200


# ---------- Weekly Digest ----------
def test_digest_requires_auth():
    assert requests.get(f"{BASE_URL}/api/admin/digest").status_code == 401
    assert requests.post(f"{BASE_URL}/api/admin/digest/send").status_code == 401


def test_digest_preview_shape(owner_token):
    r = requests.get(f"{BASE_URL}/api/admin/digest", headers=auth(owner_token))
    assert r.status_code == 200
    body = r.json()
    assert "totals" in body and "by_member" in body
    for k in ("overdue", "pending", "completed_this_week"):
        assert k in body["totals"]
        assert isinstance(body["totals"][k], int)
    assert "email_configured" in body
    assert isinstance(body["email_configured"], bool)


def test_digest_send_400_without_key(owner_token):
    r = requests.post(f"{BASE_URL}/api/admin/digest/send", headers=auth(owner_token))
    # RESEND_API_KEY not configured => 400
    assert r.status_code == 400
    assert "Resend" in r.json().get("detail", "") or "RESEND" in r.json().get("detail", "")


# ---------- Regression ----------
def test_workflow_jump_blocked(owner_token):
    # Create a task then try to jump Assigned->Pending Approval directly
    payload = {"title": "TEST_iter3_jump", "description": "", "assignee_id": "member_areeba",
               "deadline": "2026-12-31", "priority": "Low"}
    created = requests.post(f"{BASE_URL}/api/admin/tasks", headers=auth(owner_token), json=payload).json()
    tid = created["id"]
    try:
        # Need to know areeba's current slug
        team = requests.get(f"{BASE_URL}/api/admin/team", headers=auth(owner_token)).json()
        areeba = next(m for m in team if m["member_id"] == "member_areeba")
        r = requests.patch(f"{BASE_URL}/api/team/{areeba['slug']}/tasks/{tid}/status",
                           json={"deliverable_url": "https://x.com/y"})
        assert r.status_code == 400
    finally:
        requests.delete(f"{BASE_URL}/api/admin/tasks/{tid}", headers=auth(owner_token))


def test_admin_summary_still_requires_auth():
    assert requests.get(f"{BASE_URL}/api/admin/summary").status_code == 401
