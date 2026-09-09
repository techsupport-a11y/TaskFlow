"""Iteration 4 backend checks: Resend key configured + regressions."""
import os, requests, pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
ORIG_PASSWORD = "RlDOuZVzPm-xqpfW"


@pytest.fixture(scope="module")
def owner_token():
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"email": "usman@taskflow.demo", "password": ORIG_PASSWORD})
    assert r.status_code == 200, r.text
    return r.json()["token"]


def auth(tok):
    return {"Authorization": f"Bearer {tok}"}


# --- Owner login regression ---
def test_owner_login_ok(owner_token):
    assert owner_token


def test_wrong_pw_fails():
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"email": "usman@taskflow.demo", "password": "wrongpw"})
    assert r.status_code == 401


# --- Owner-only privacy ---
@pytest.mark.parametrize("path", [
    "/api/admin/financials",
    "/api/admin/audit",
    "/api/admin/team",
    "/api/admin/summary",
    "/api/admin/digest",
])
def test_owner_endpoints_require_auth(path):
    r = requests.get(f"{BASE_URL}{path}")
    assert r.status_code == 401, f"{path} returned {r.status_code}"


def test_public_team_members_hides_pin_and_slug():
    r = requests.get(f"{BASE_URL}/api/team/members")
    assert r.status_code == 200
    data = r.json()
    assert isinstance(data, list) and len(data) > 0
    for m in data:
        assert "pin" not in m
        assert "slug" not in m


# --- Digest: Resend configured ---
def test_digest_preview_email_configured_true(owner_token):
    r = requests.get(f"{BASE_URL}/api/admin/digest", headers=auth(owner_token))
    assert r.status_code == 200
    body = r.json()
    assert body.get("email_configured") is True, body


def test_digest_send_no_longer_400(owner_token):
    r = requests.post(f"{BASE_URL}/api/admin/digest/send", headers=auth(owner_token))
    # Should now be 200 (per-owner delivery may still error inside body due to Resend test mode)
    assert r.status_code == 200, f"status={r.status_code} body={r.text}"
    body = r.json()
    # Some kind of response with results/hint present
    assert isinstance(body, dict)


# --- Team direct link regression ---
def test_team_mahnoor_still_public():
    r = requests.get(f"{BASE_URL}/api/team/mahnoor")
    assert r.status_code == 200
    body = r.json()
    assert "member" in body or "tasks" in body


# --- Workflow enforcement regression ---
def test_workflow_mismatch_rejected(owner_token):
    payload = {"title": "TEST_iter4_wf", "description": "", "assignee_id": "member_mahnoor",
               "deadline": "2026-12-31", "priority": "Low"}
    created = requests.post(f"{BASE_URL}/api/admin/tasks",
                            headers=auth(owner_token), json=payload).json()
    tid = created["id"]
    try:
        # Attempt PATCH without required transition context / bad status jump.
        # Send an unknown target status -> should reject.
        r = requests.patch(f"{BASE_URL}/api/team/mahnoor/tasks/{tid}/status",
                           json={"deliverable_url": "https://x.com/y",
                                 "target_status": "Completed"})
        assert r.status_code == 400
    finally:
        requests.delete(f"{BASE_URL}/api/admin/tasks/{tid}", headers=auth(owner_token))


# --- Admin summary populated ---
def test_admin_summary_shape(owner_token):
    r = requests.get(f"{BASE_URL}/api/admin/summary", headers=auth(owner_token))
    assert r.status_code == 200
    body = r.json()
    assert isinstance(body, dict)
