"""Iteration 2 targeted checks for TaskFlow review request."""
import os, requests, pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
PASSWORD = "RlDOuZVzPm-xqpfW"


@pytest.fixture(scope="module")
def owner_token():
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": "usman@taskflow.demo", "password": PASSWORD})
    assert r.status_code == 200
    return r.json()["token"]


@pytest.mark.parametrize("slug", ["mahnoor", "areeba", "zain"])
def test_direct_team_slug_returns_private_board(slug):
    r = requests.get(f"{BASE_URL}/api/team/{slug}")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["member"]["name"].lower() == slug
    assert "pin" not in body["member"]
    # only tasks for this member
    for t in body["tasks"]:
        assert t["assignee_id"] == body["member"]["member_id"]


def test_public_members_no_pin_no_slug():
    members = requests.get(f"{BASE_URL}/api/team/members").json()
    for m in members:
        assert "pin" not in m
        assert "slug" not in m


@pytest.mark.parametrize("path", [
    "/api/admin/financials",
    "/api/admin/audit",
    "/api/admin/team",
    "/api/admin/summary",
])
def test_admin_endpoints_require_auth(path):
    assert requests.get(f"{BASE_URL}{path}").status_code == 401


def test_admin_tasks_post_requires_auth():
    r = requests.post(f"{BASE_URL}/api/admin/tasks", json={"title": "x", "assignee_id": "y", "deadline": "2026-12-31"})
    assert r.status_code == 401


def test_reject_flow_moves_to_revision_required(owner_token):
    auth = {"Authorization": f"Bearer {owner_token}"}
    # Create task
    payload = {"title": "TEST_reject_flow", "description": "", "assignee_id": "member_zain",
               "deadline": "2026-12-31", "priority": "Low", "instructions": ""}
    created = requests.post(f"{BASE_URL}/api/admin/tasks", headers=auth, json=payload).json()
    task_id = created["id"]
    try:
        # Team: Assigned -> Completed should be rejected (only Assigned->In Progress allowed)
        # Try skipping straight to a status with a deliverable via forward rules:
        # Attempt: Assigned + deliverable_url should try to jump to Pending Approval - not allowed
        skip = requests.patch(f"{BASE_URL}/api/team/zain/tasks/{task_id}/status",
                              json={"deliverable_url": "https://x.com/y"})
        assert skip.status_code == 400  # Assigned -> Pending Approval blocked

        # Legit progression
        requests.patch(f"{BASE_URL}/api/team/zain/tasks/{task_id}/status", json={"deliverable_url": ""})
        requests.patch(f"{BASE_URL}/api/team/zain/tasks/{task_id}/status",
                       json={"deliverable_url": "https://x.com/deliverable"})

        # Reject without feedback -> 400
        bad = requests.post(f"{BASE_URL}/api/admin/tasks/{task_id}/reject", headers=auth, json={"feedback": "   "})
        assert bad.status_code == 400

        # Reject with feedback -> Revision Required
        ok = requests.post(f"{BASE_URL}/api/admin/tasks/{task_id}/reject", headers=auth,
                           json={"feedback": "Needs cleaner output"})
        assert ok.status_code == 200

        # Verify via team endpoint
        board = requests.get(f"{BASE_URL}/api/team/zain").json()
        this_task = next(t for t in board["tasks"] if t["id"] == task_id)
        assert this_task["status"] == "Revision Required"
        assert this_task.get("revision_feedback") == "Needs cleaner output"
    finally:
        requests.delete(f"{BASE_URL}/api/admin/tasks/{task_id}", headers=auth)


def test_google_session_invalid_id_rejected():
    r = requests.post(f"{BASE_URL}/api/auth/google/session", json={"session_id": "definitely-invalid-xyz"})
    # backend calls emergent's endpoint; invalid session -> 403 (not owner) or 502 network issue
    assert r.status_code in (400, 403, 502)
