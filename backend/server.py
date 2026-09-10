from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI, APIRouter, HTTPException, Request, Response, Depends
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime, timezone, timedelta
from pathlib import Path
import os, uuid, secrets, jwt, bcrypt, logging, requests, asyncio, resend, certifi
from dateutil import parser as dateparser

ROOT_DIR = Path(__file__).parent
mongo_url = os.environ["MONGO_URL"]
mongo_kwargs = {"tlsCAFile": certifi.where()} if mongo_url.startswith("mongodb+srv://") else {}
client = AsyncIOMotorClient(mongo_url, **mongo_kwargs)
db = client[os.environ["DB_NAME"]]
app = FastAPI(title="TaskFlow API")
api = APIRouter(prefix="/api")
STATUSES = ["Assigned", "In Progress", "Pending Approval", "Revision Required", "Completed"]
TEAM_FORWARD = {"Assigned": "In Progress", "In Progress": "Pending Approval", "Revision Required": "In Progress"}
OWNER_TRANSITIONS = {"Pending Approval": ["Completed", "Revision Required"]}

class LoginInput(BaseModel): email: str; password: str
class PasswordChange(BaseModel): current_password: str; new_password: str
class NameChange(BaseModel): name: str
class OwnerEmailChange(BaseModel): email: str
class TaskInput(BaseModel):
    title: str; description: str = ""; assignee_id: str; deadline: str; priority: str = "Medium"; instructions: str = ""
class TaskUpdate(BaseModel):
    title: Optional[str] = None; description: Optional[str] = None; assignee_id: Optional[str] = None
    deadline: Optional[str] = None; priority: Optional[str] = None; instructions: Optional[str] = None
class CommentInput(BaseModel): comment: str
class DeliverableInput(BaseModel): deliverable_url: str
class TeamInput(BaseModel): name: str; classification: str = "Junior"
class PinInput(BaseModel): member_id: str; pin: str
class PinSetInput(BaseModel): pin: str
class RejectInput(BaseModel): feedback: str
class EmailInput(BaseModel): email: str

def now(): return datetime.now(timezone.utc).isoformat()
def hash_pw(value): return bcrypt.hashpw(value.encode(), bcrypt.gensalt()).decode()
def verify_pw(value, hashed): return bcrypt.checkpw(value.encode(), hashed.encode())
def token_for(user_id, email): return jwt.encode({"sub": user_id, "email": email, "exp": datetime.now(timezone.utc)+timedelta(hours=8)}, os.environ["JWT_SECRET"], algorithm="HS256")
async def current_owner(request: Request):
    token = request.cookies.get("access_token") or request.headers.get("Authorization", "").replace("Bearer ", "")
    if not token: raise HTTPException(401, "Owner login required")
    try: payload = jwt.decode(token, os.environ["JWT_SECRET"], algorithms=["HS256"])
    except Exception: raise HTTPException(401, "Session expired")
    user = await db.users.find_one({"user_id": payload.get("sub"), "role": "owner"}, {"_id": 0})
    if not user: raise HTTPException(403, "Owner access required")
    return user
async def public_member(slug):
    member = await db.team.find_one({"slug": slug, "active": True}, {"_id": 0})
    if not member: raise HTTPException(404, "Team link not found")
    return member
def clean_task(t):
    t.pop("_id", None); return t
async def log_change(task_id, actor, old, new, note=""):
    await db.audit.insert_one({"id": str(uuid.uuid4()), "task_id": task_id, "actor": actor, "from_status": old, "to_status": new, "note": note, "timestamp": now()})

@app.on_event("startup")
async def seed():
    await db.users.create_index("email", unique=True)
    await db.team.create_index("slug", unique=True)
    owners = [("usman@taskflow.demo", "Usman"), ("hannah@taskflow.demo", "Hannah")]
    for email, name in owners:
        if not await db.users.find_one({"email": email}):
            await db.users.insert_one({"user_id": "owner_"+name.lower(), "email": email, "name": name, "role": "owner", "password_hash": hash_pw(os.environ["ADMIN_PASSWORD"]), "created_at": now()})
    if await db.team.count_documents({}) == 0:
        for name, classification, pin in [("Mahnoor", "Senior", "2741"), ("Areeba", "Junior", "6318"), ("Zain", "Junior", "5082")]:
            await db.team.insert_one({"member_id": "member_"+name.lower(), "name": name, "classification": classification, "pin": pin, "slug": name.lower(), "active": True, "created_at": now()})

@api.post("/auth/login")
async def login(data: LoginInput, response: Response):
    user = await db.users.find_one({"email": data.email.lower().strip()}, {"_id": 0})
    if not user or not verify_pw(data.password, user["password_hash"]): raise HTTPException(401, "Email or password is incorrect")
    token = token_for(user["user_id"], user["email"]); response.set_cookie("access_token", token, httponly=True, samesite="lax", max_age=28800)
    return {"token": token, "user": {"user_id": user["user_id"], "name": user["name"], "email": user["email"], "role": user["role"]}}
@api.post("/auth/logout")
async def logout(response: Response): response.delete_cookie("access_token"); return {"ok": True}
@api.get("/auth/me")
async def me(user=Depends(current_owner)): return {k:v for k,v in user.items() if k != "password_hash"}
@api.post("/auth/google")
async def google_placeholder():
    raise HTTPException(400, "Use the browser Google sign-in button")
@api.post("/auth/google/session")
async def google_session(data: dict, response: Response):
    session_id = data.get("session_id")
    if not session_id: raise HTTPException(400, "Missing Google session")
    try:
        result = requests.get("https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data", headers={"X-Session-ID": session_id}, timeout=10).json()
    except Exception: raise HTTPException(502, "Google sign-in could not be verified")
    user = await db.users.find_one({"email": result.get("email", "").lower(), "role": "owner"}, {"_id": 0})
    if not user: raise HTTPException(403, "This Google account is not one of the two TaskFlow owners")
    token = token_for(user["user_id"], user["email"]); response.set_cookie("access_token", token, httponly=True, samesite="lax", max_age=28800)
    return {"token": token, "user": {"user_id": user["user_id"], "name": user["name"], "email": user["email"], "role": user["role"]}}

@api.post("/team/access")
async def team_access(data: PinInput):
    member = await db.team.find_one({"member_id": data.member_id, "pin": data.pin, "active": True}, {"_id": 0, "pin": 0})
    if not member: raise HTTPException(401, "That PIN does not match")
    return member
@api.get("/team/members")
async def public_members(): return await db.team.find({"active": True}, {"_id": 0, "pin": 0, "slug": 0}).to_list(50)
@api.get("/team/{slug}")
async def team_view(slug: str):
    member = await public_member(slug)
    tasks = await db.tasks.find({"assignee_id": member["member_id"]}, {"_id": 0}).sort("deadline", 1).to_list(200)
    return {"member": {k:v for k,v in member.items() if k != "pin"}, "tasks": tasks}
@api.patch("/team/{slug}/tasks/{task_id}/status")
async def team_status(slug: str, task_id: str, data: DeliverableInput):
    member = await public_member(slug)
    task = await db.tasks.find_one({"id": task_id, "assignee_id": member["member_id"]}, {"_id": 0})
    if not task: raise HTTPException(404, "Task not found")
    target = "Pending Approval" if data.deliverable_url else "In Progress"
    if TEAM_FORWARD.get(task["status"]) != target: raise HTTPException(400, "That status change is not allowed")
    update = {"status": target, "updated_at": now()}
    if data.deliverable_url: update["deliverable_url"] = data.deliverable_url
    await db.tasks.update_one({"id": task_id}, {"$set": update})
    await log_change(task_id, member["name"], task["status"], target)
    return {"ok": True, "status": target}
@api.patch("/team/{slug}/email")
async def set_member_email(slug: str, data: EmailInput):
    member = await public_member(slug)
    if data.email and "@" not in data.email: raise HTTPException(400, "Enter a valid email address")
    await db.team.update_one({"member_id": member["member_id"]}, {"$set": {"email": data.email.strip()}})
    return {"ok": True, "email": data.email.strip()}
@api.post("/team/{slug}/tasks/{task_id}/comments")
async def team_comment(slug: str, task_id: str, data: CommentInput):
    member = await public_member(slug)
    task = await db.tasks.find_one({"id": task_id, "assignee_id": member["member_id"]}, {"_id": 0})
    if not task: raise HTTPException(404, "Task not found")
    comment = {"id": str(uuid.uuid4()), "author": member["name"], "comment": data.comment, "timestamp": now()}
    await db.tasks.update_one({"id": task_id}, {"$push": {"comments": comment}}); return comment

@api.get("/admin/summary")
async def summary(user=Depends(current_owner)):
    tasks = await db.tasks.find({}, {"_id": 0}).to_list(500); counts = {s: sum(1 for t in tasks if t["status"] == s) for s in STATUSES}
    return {"counts": counts, "pending": counts["Pending Approval"], "tasks": tasks, "recent": await db.audit.find({}, {"_id": 0}).sort("timestamp", -1).to_list(8)}
@api.get("/admin/team")
async def admin_team(user=Depends(current_owner)): return await db.team.find({}, {"_id": 0, "pin": 0}).to_list(50)
def _assignment_email_html(member_name, task, slug):
    base = os.environ.get("CORS_ORIGINS", "")
    link = f"{base}/team/{slug}" if base and base != "*" else None
    cta = f"<p style='margin:20px 0'><a href='{link}' style='background:#111844;color:#fff;padding:10px 20px;border-radius:999px;text-decoration:none;display:inline-block'>Open my board</a></p>" if link else ""
    return f"""<div style="font-family:Helvetica,Arial,sans-serif;max-width:600px;color:#0F0E0E"><h2 style="color:#111844">TaskFlow · New task assigned</h2><p>Hi {member_name}, you've been assigned a new task.</p><table style="width:100%;border-collapse:collapse;margin:16px 0"><tr><td style="background:#f5f5f2;padding:14px"><b>{task['title']}</b><br><span style="color:#555">{task.get('description') or task.get('instructions') or 'No additional details'}</span></td></tr></table><p><b>Priority:</b> {task['priority']} &nbsp; <b>Deadline:</b> {task['deadline'][:10]}</p>{cta}</div>"""

async def _notify_assignment(member, task):
    if not member.get("email"): return None
    key = os.environ.get("RESEND_API_KEY")
    if not key: return {"sent": False, "error": "Email delivery is not configured (missing RESEND_API_KEY)."}
    resend.api_key = key
    try:
        await asyncio.to_thread(resend.Emails.send, {"from": os.environ.get("SENDER_EMAIL", "onboarding@resend.dev"), "to": [member["email"]], "subject": f"TaskFlow — New task: {task['title']}", "html": _assignment_email_html(member["name"], task, member["slug"])})
        return {"sent": True}
    except Exception as e:
        logging.warning(f"Assignment email to {member['email']} failed: {e}")
        return {"sent": False, "error": str(e)}

@api.post("/admin/tasks")
async def create_task(data: TaskInput, user=Depends(current_owner)):
    member = await db.team.find_one({"member_id": data.assignee_id}, {"_id": 0})
    if not member: raise HTTPException(400, "Team member not found")
    task = {"id": "task_"+uuid.uuid4().hex[:10], **data.model_dump(), "assignee_name": member["name"], "status": "Assigned", "comments": [], "created_at": now(), "updated_at": now()}
    await db.tasks.insert_one(task)
    await log_change(task["id"], user["name"], "—", "Assigned", "Task created")
    email_result = await _notify_assignment(member, task)
    result = clean_task(task)
    if email_result and not email_result["sent"]:
        result["email_warning"] = f"Task created, but the notification email to {member['email']} could not be sent: {email_result['error']}"
    return result
@api.patch("/admin/tasks/{task_id}")
async def edit_task(task_id: str, data: TaskUpdate, user=Depends(current_owner)):
    patch = {k:v for k,v in data.model_dump().items() if v is not None}
    old = await db.tasks.find_one({"id": task_id}, {"_id": 0})
    if not old: raise HTTPException(404, "Task not found")
    if "assignee_id" in patch:
        member = await db.team.find_one({"member_id": patch["assignee_id"]}, {"_id": 0}); patch["assignee_name"] = member["name"] if member else ""
    patch["updated_at"] = now()
    await db.tasks.update_one({"id": task_id}, {"$set": patch})
    changes = [f"{field.replace('_', ' ').title()}: {old.get(field)} → {patch[field]}" for field in ("title", "description", "instructions", "assignee_name", "deadline", "priority") if field in patch and patch[field] != old.get(field)]
    if changes: await log_change(task_id, user["name"], old["status"], old["status"], "; ".join(changes))
    return clean_task(await db.tasks.find_one({"id": task_id}, {"_id": 0}))
@api.delete("/admin/tasks/{task_id}")
async def delete_task(task_id: str, user=Depends(current_owner)): await db.tasks.delete_one({"id": task_id}); return {"ok": True}
@api.post("/admin/tasks/{task_id}/approve")
async def approve(task_id: str, user=Depends(current_owner)):
    task = await db.tasks.find_one({"id": task_id}, {"_id": 0})
    if not task or task["status"] != "Pending Approval": raise HTTPException(400, "Only pending tasks can be approved")
    await db.tasks.update_one({"id": task_id}, {"$set": {"status": "Completed", "updated_at": now()}}); await log_change(task_id, user["name"], task["status"], "Completed"); return {"ok": True}
@api.post("/admin/tasks/{task_id}/reject")
async def reject(task_id: str, data: RejectInput, user=Depends(current_owner)):
    if not data.feedback.strip(): raise HTTPException(400, "Feedback is required")
    task = await db.tasks.find_one({"id": task_id}, {"_id": 0})
    if not task or task["status"] != "Pending Approval": raise HTTPException(400, "Only pending tasks can be rejected")
    await db.tasks.update_one({"id": task_id}, {"$set": {"status": "Revision Required", "revision_feedback": data.feedback, "updated_at": now()}}); await log_change(task_id, user["name"], task["status"], "Revision Required", data.feedback); return {"ok": True}
@api.post("/admin/team")
async def add_team(data: TeamInput, user=Depends(current_owner)):
    item = {"member_id": "member_"+uuid.uuid4().hex[:10], "name": data.name, "classification": data.classification, "pin": str(secrets.randbelow(9000)+1000), "slug": data.name.lower().replace(" ", "-")+"-"+secrets.token_urlsafe(5).lower(), "active": True, "created_at": now()}
    await db.team.insert_one(item); return clean_task(item)
@api.post("/admin/team/{member_id}/toggle")
async def toggle_team_member(member_id: str, user=Depends(current_owner)):
    member = await db.team.find_one({"member_id": member_id}, {"_id": 0})
    if not member: raise HTTPException(404, "Team member not found")
    new_active = not member.get("active", True)
    await db.team.update_one({"member_id": member_id}, {"$set": {"active": new_active}})
    return {"ok": True, "active": new_active}
@api.delete("/admin/team/{member_id}")
async def remove_team_member(member_id: str, user=Depends(current_owner)):
    result = await db.team.delete_one({"member_id": member_id})
    if result.deleted_count == 0: raise HTTPException(404, "Team member not found")
    return {"ok": True}
@api.get("/admin/financials")
async def financials(user=Depends(current_owner)):
    return {"payments": [{"member": "Mahnoor", "period": "March 2026", "amount": 1840, "state": "Ready"}], "rates": [{"member": "Mahnoor", "rate": 28}, {"member": "Areeba", "rate": 18}], "budget_note": "Keep contractor spend aligned with approved weekly scopes.", "reports": {"completion_rate": 78, "avg_turnaround": "2.4 days"}}
@api.get("/admin/audit")
async def audit(user=Depends(current_owner)): return await db.audit.find({}, {"_id": 0}).sort("timestamp", -1).to_list(200)

@api.post("/auth/password")
async def change_password(data: PasswordChange, user=Depends(current_owner)):
    if len(data.new_password) < 8: raise HTTPException(400, "New password must be at least 8 characters")
    full = await db.users.find_one({"user_id": user["user_id"]}, {"_id": 0})
    if not verify_pw(data.current_password, full["password_hash"]): raise HTTPException(401, "Current password is incorrect")
    await db.users.update_one({"user_id": user["user_id"]}, {"$set": {"password_hash": hash_pw(data.new_password), "password_updated_at": now()}})
    return {"ok": True}
@api.patch("/auth/name")
async def change_name(data: NameChange, user=Depends(current_owner)):
    if not data.name.strip(): raise HTTPException(400, "Name cannot be empty")
    await db.users.update_one({"user_id": user["user_id"]}, {"$set": {"name": data.name.strip()}})
    return {"ok": True, "name": data.name.strip()}
@api.patch("/auth/email")
async def change_owner_email(data: OwnerEmailChange, user=Depends(current_owner)):
    new_email = data.email.lower().strip()
    if "@" not in new_email: raise HTTPException(400, "Enter a valid email address")
    existing = await db.users.find_one({"email": new_email})
    if existing and existing["user_id"] != user["user_id"]: raise HTTPException(400, "That email is already in use")
    await db.users.update_one({"user_id": user["user_id"]}, {"$set": {"email": new_email}})
    return {"ok": True, "email": new_email}

@api.get("/admin/team/{member_id}/pin")
async def get_pin(member_id: str, user=Depends(current_owner)):
    member = await db.team.find_one({"member_id": member_id}, {"_id": 0, "pin": 1})
    if not member: raise HTTPException(404, "Team member not found")
    return {"pin": member["pin"]}
@api.post("/admin/team/{member_id}/pin")
async def set_pin(member_id: str, data: PinSetInput, user=Depends(current_owner)):
    if not data.pin.isdigit() or len(data.pin) != 4: raise HTTPException(400, "PIN must be exactly 4 digits")
    result = await db.team.update_one({"member_id": member_id}, {"$set": {"pin": data.pin, "rotated_at": now()}})
    if result.matched_count == 0: raise HTTPException(404, "Team member not found")
    return {"ok": True, "pin": data.pin}

@api.post("/admin/team/{member_id}/rotate")
async def rotate_access(member_id: str, user=Depends(current_owner)):
    member = await db.team.find_one({"member_id": member_id}, {"_id": 0})
    if not member: raise HTTPException(404, "Team member not found")
    new_slug = member["name"].lower().replace(" ", "-") + "-" + secrets.token_urlsafe(5).lower()
    new_pin = str(secrets.randbelow(9000) + 1000)
    await db.team.update_one({"member_id": member_id}, {"$set": {"slug": new_slug, "pin": new_pin, "rotated_at": now()}})
    return {"member_id": member_id, "name": member["name"], "slug": new_slug, "pin": new_pin}

def _week_bounds():
    n = datetime.now(timezone.utc); start = n - timedelta(days=7)
    return start.isoformat(), n.isoformat()

async def _build_digest():
    start, end = _week_bounds(); today = datetime.now(timezone.utc)
    tasks = await db.tasks.find({}, {"_id": 0}).to_list(500)
    overdue = [t for t in tasks if t["status"] not in ("Completed",) and t.get("deadline") and dateparser.isoparse(t["deadline"]).replace(tzinfo=timezone.utc) < today]
    pending = [t for t in tasks if t["status"] == "Pending Approval"]
    completed_week = [t for t in tasks if t["status"] == "Completed" and t.get("updated_at", "") >= start]
    by_member = {}
    for t in tasks:
        m = t.get("assignee_name", "—")
        by_member.setdefault(m, {"in_progress": 0, "pending": 0, "completed": 0, "overdue": 0})
        if t["status"] == "In Progress": by_member[m]["in_progress"] += 1
        if t["status"] == "Pending Approval": by_member[m]["pending"] += 1
        if t["status"] == "Completed" and t.get("updated_at", "") >= start: by_member[m]["completed"] += 1
        if t in overdue: by_member[m]["overdue"] += 1
    return {"period_start": start, "period_end": end, "overdue": overdue, "pending": pending, "completed_this_week": completed_week, "by_member": by_member, "totals": {"overdue": len(overdue), "pending": len(pending), "completed_this_week": len(completed_week)}}

def _digest_html(d, owner_name):
    rows = "".join(f"<tr><td style='padding:6px 10px;border-bottom:1px solid #eee'>{m}</td><td style='padding:6px 10px;border-bottom:1px solid #eee'>{v['in_progress']}</td><td style='padding:6px 10px;border-bottom:1px solid #eee'>{v['pending']}</td><td style='padding:6px 10px;border-bottom:1px solid #eee'>{v['completed']}</td><td style='padding:6px 10px;border-bottom:1px solid #eee;color:#8e2925'>{v['overdue']}</td></tr>" for m, v in d["by_member"].items())
    return f"""<div style="font-family:Helvetica,Arial,sans-serif;max-width:600px;color:#0F0E0E"><h2 style="color:#1B211A">TaskFlow · Weekly digest</h2><p>Hi {owner_name}, here's your team snapshot.</p><table style="width:100%;border-collapse:collapse;margin:16px 0"><tr><td style="background:#f5f5f2;padding:14px"><b>Overdue</b><br><span style="font-size:28px">{d['totals']['overdue']}</span></td><td style="background:#f5f5f2;padding:14px"><b>Pending approval</b><br><span style="font-size:28px">{d['totals']['pending']}</span></td><td style="background:#f5f5f2;padding:14px"><b>Completed</b><br><span style="font-size:28px">{d['totals']['completed_this_week']}</span></td></tr></table><h3>By teammate</h3><table style="width:100%;border-collapse:collapse;font-size:13px"><thead><tr style="background:#1B211A;color:#fff"><th style="padding:8px 10px;text-align:left">Member</th><th style="padding:8px 10px">In progress</th><th style="padding:8px 10px">Pending</th><th style="padding:8px 10px">Completed</th><th style="padding:8px 10px">Overdue</th></tr></thead><tbody>{rows}</tbody></table></div>"""

@api.get("/admin/digest")
async def digest_preview(user=Depends(current_owner)):
    d = await _build_digest(); return {**d, "email_configured": bool(os.environ.get("RESEND_API_KEY"))}

@api.post("/admin/digest/send")
async def digest_send(user=Depends(current_owner)):
    key = os.environ.get("RESEND_API_KEY")
    if not key: raise HTTPException(400, "Resend API key not configured. Set RESEND_API_KEY in backend/.env to enable email delivery.")
    resend.api_key = key
    owners = await db.users.find({"role": "owner"}, {"_id": 0}).to_list(10)
    d = await _build_digest(); results = []
    for o in owners:
        try:
            r = await asyncio.to_thread(resend.Emails.send, {"from": os.environ.get("SENDER_EMAIL", "onboarding@resend.dev"), "to": [o["email"]], "subject": "TaskFlow — Weekly digest", "html": _digest_html(d, o["name"])})
            results.append({"email": o["email"], "id": r.get("id"), "ok": True})
        except Exception as e:
            results.append({"email": o["email"], "ok": False, "error": str(e)})
    return {"sent": results, "digest": d}

app.include_router(api)
app.add_middleware(CORSMiddleware, allow_credentials=True, allow_origins=[os.environ.get("CORS_ORIGINS", "*")], allow_methods=["*"], allow_headers=["*"])
@app.on_event("shutdown")
async def shutdown(): client.close()