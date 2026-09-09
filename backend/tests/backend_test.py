"""Regression coverage for TaskFlow public team access and owner authentication."""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
PASSWORD = "RlDOuZVzPm-xqpfW"


@pytest.fixture(scope="module")
def client():
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    return session


def login(client, email):
    response = client.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": PASSWORD})
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["user"]["role"] == "owner"
    assert isinstance(body["token"], str) and body["token"]
    return body["token"]


def test_public_members_do_not_expose_pins_or_admin_data(client):
    response = client.get(f"{BASE_URL}/api/team/members")
    assert response.status_code == 200
    members = response.json()
    assert {m["name"] for m in members} >= {"Mahnoor", "Areeba", "Zain"}
    for member in members:
        assert "pin" not in member and "password_hash" not in member


def test_invalid_pin_rejected_and_valid_pin_returns_private_member(client):
    members = client.get(f"{BASE_URL}/api/team/members").json()
    mahnoor = next(m for m in members if m["name"] == "Mahnoor")
    invalid = client.post(f"{BASE_URL}/api/team/access", json={"member_id": mahnoor["member_id"], "pin": "0000"})
    assert invalid.status_code == 401
    valid = client.post(f"{BASE_URL}/api/team/access", json={"member_id": mahnoor["member_id"], "pin": "2741"})
    assert valid.status_code == 200
    assert valid.json()["name"] == "Mahnoor"
    assert "pin" not in valid.json()


def test_team_slug_returns_only_assigned_tasks(client):
    members = client.get(f"{BASE_URL}/api/team/members").json()
    # Resolve the private slug through the PIN endpoint, as the public list intentionally omits it.
    access = client.post(f"{BASE_URL}/api/team/access", json={"member_id": next(m["member_id"] for m in members if m["name"] == "Mahnoor"), "pin": "2741"}).json()
    response = client.get(f"{BASE_URL}/api/team/{access['slug']}")
    assert response.status_code == 200
    body = response.json()
    assert body["member"]["name"] == "Mahnoor"
    assert "pin" not in body["member"]
    assert all(task["assignee_id"] == body["member"]["member_id"] for task in body["tasks"])


@pytest.mark.parametrize("email", ["usman@taskflow.demo", "hena@taskflow.demo"])
def test_both_owners_login_me_and_logout(client, email):
    token = login(client, email)
    auth = {"Authorization": f"Bearer {token}"}
    me = client.get(f"{BASE_URL}/api/auth/me", headers=auth)
    assert me.status_code == 200 and me.json()["email"] == email
    financials = client.get(f"{BASE_URL}/api/admin/financials", headers=auth)
    assert financials.status_code == 200 and "payments" in financials.json()
    assert client.post(f"{BASE_URL}/api/auth/logout").status_code == 200


def test_admin_financials_and_summary_are_blocked_without_auth(client):
    assert client.get(f"{BASE_URL}/api/admin/financials").status_code == 401
    assert client.get(f"{BASE_URL}/api/admin/summary").status_code == 401


def test_google_session_requires_session_id(client):
    response = client.post(f"{BASE_URL}/api/auth/google/session", json={})
    assert response.status_code == 400


def test_task_forward_status_rules_and_owner_approval(client):
    token = login(client, "usman@taskflow.demo")
    auth = {"Authorization": f"Bearer {token}"}
    members = client.get(f"{BASE_URL}/api/team/members").json()
    mahnoor = next(m for m in members if m["name"] == "Mahnoor")
    access = client.post(f"{BASE_URL}/api/team/access", json={"member_id": mahnoor["member_id"], "pin": "2741"}).json()
    payload = {"title": "TEST_status_flow", "description": "Regression task", "assignee_id": mahnoor["member_id"], "deadline": "2026-12-31", "priority": "Low", "instructions": "Submit a link"}
    created = client.post(f"{BASE_URL}/api/admin/tasks", headers=auth, json=payload)
    assert created.status_code == 200
    task_id = created.json()["id"]
    try:
        progressing = client.patch(f"{BASE_URL}/api/team/{access['slug']}/tasks/{task_id}/status", json={"deliverable_url": ""})
        assert progressing.status_code == 200 and progressing.json()["status"] == "In Progress"
        invalid = client.patch(f"{BASE_URL}/api/team/{access['slug']}/tasks/{task_id}/status", json={"deliverable_url": ""})
        assert invalid.status_code == 400
        pending = client.patch(f"{BASE_URL}/api/team/{access['slug']}/tasks/{task_id}/status", json={"deliverable_url": "https://example.com/deliverable"})
        assert pending.status_code == 200 and pending.json()["status"] == "Pending Approval"
        approved = client.post(f"{BASE_URL}/api/admin/tasks/{task_id}/approve", headers=auth)
        assert approved.status_code == 200
    finally:
        client.delete(f"{BASE_URL}/api/admin/tasks/{task_id}", headers=auth)