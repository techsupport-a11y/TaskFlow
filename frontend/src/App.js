import { useEffect, useState } from "react";
import {
  BrowserRouter, Routes, Route, Link,
  useNavigate, useParams, useLocation, Navigate, Outlet,
} from "react-router-dom";
import {
  LayoutDashboard, ListTodo, Users, WalletCards, ClipboardList,
  LogOut, Plus, ArrowRight, Check, X, Menu, ChevronRight, Trash2, Pencil,
  RotateCw, KeyRound, Mail, Send, Copy, UserX, UserCheck,
} from "lucide-react";
import axios from "axios";
import "@/App.css";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const api = axios.create({ baseURL: API, withCredentials: true });
api.interceptors.request.use((c) => {
  const t = localStorage.getItem("taskflow_token");
  if (t) c.headers.Authorization = `Bearer ${t}`;
  return c;
});

const statuses = ["Assigned", "In Progress", "Pending Approval", "Revision Required", "Completed"];
const priorities = ["Low", "Medium", "High"];
const fmt = (d) => (d ? new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "—");

function Badge({ status }) {
  return (
    <span
      data-testid={`status-badge-${status.toLowerCase().replaceAll(" ", "-")}`}
      className={`badge badge-${status.toLowerCase().replaceAll(" ", "-")}`}
    >
      {status}
    </span>
  );
}

/* -------------------- Owner Shell -------------------- */
function Shell({ user, onLogout }) {
  const loc = useLocation();
  const [open, setOpen] = useState(false);
  const [showPass, setShowPass] = useState(false);
  const nav = [
    { id: "overview", label: "Overview", icon: LayoutDashboard, path: "/admin" },
    { id: "tasks", label: "All tasks", icon: ListTodo, path: "/admin/tasks" },
    { id: "team", label: "Team", icon: Users, path: "/admin/team" },
    { id: "digest", label: "Weekly digest", icon: Mail, path: "/admin/digest" },
    { id: "finance", label: "Finance", icon: WalletCards, path: "/admin/finance" },
    { id: "audit", label: "Audit trail", icon: ClipboardList, path: "/admin/audit" },
  ];
  const activeId =
    loc.pathname === "/admin" || loc.pathname === "/admin/"
      ? "overview"
      : nav.find((n) => n.path !== "/admin" && loc.pathname.startsWith(n.path))?.id || "overview";

  return (
    <div className="admin-shell">
      <aside className={open ? "open" : ""}>
        <div className="side-top">
          <div className="brand">
            <img src="/Favicon.png" alt="TaskFlow" className="brand-mark" />
            <span>Task<span>Flow</span></span>
          </div>
          <button
            data-testid="mobile-nav-toggle"
            className="mobile-toggle"
            onClick={() => setOpen((o) => !o)}
            aria-label="Toggle navigation"
          >
            <Menu size={18} />
          </button>
        </div>
        <p className="side-kicker">OWNER · {user?.name?.toUpperCase()}</p>
        <nav>
          {nav.map((n) => (
            <Link
              data-testid={`admin-nav-${n.id}`}
              key={n.id}
              to={n.path}
              className={activeId === n.id ? "active" : ""}
              onClick={() => setOpen(false)}
            >
              <n.icon size={17} />
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="side-bottom">
          <button data-testid="change-password-button" onClick={() => setShowPass(true)}>
            <KeyRound size={16} /> Change password
          </button>
          <Link data-testid="team-view-link" to="/">
            Open team view <ArrowRight size={14} />
          </Link>
          <button data-testid="logout-button" onClick={onLogout}>
            <LogOut size={16} /> Sign out
          </button>
        </div>
      </aside>
      <main className="admin-main">
        <Outlet />
      </main>
      {showPass && <PasswordModal onClose={() => setShowPass(false)} />}
    </div>
  );
}

function PasswordModal({ onClose }) {
  const [cur, setCur] = useState("");
  const [nw, setNw] = useState("");
  const [confirm, setConfirm] = useState("");
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setErr("");
    setMsg("");
    if (nw.length < 8) return setErr("New password must be at least 8 characters.");
    if (nw !== confirm) return setErr("Passwords don't match.");
    setBusy(true);
    try {
      await api.post("/auth/password", { current_password: cur, new_password: nw });
      setMsg("Password updated. You'll use the new one next time.");
      setCur("");
      setNw("");
      setConfirm("");
    } catch (e) {
      setErr(e.response?.data?.detail || "Could not update password");
    }
    setBusy(false);
  };
  return (
    <div className="modal-wrap" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <button className="icon-btn close" onClick={onClose} data-testid="password-modal-close">×</button>
        <p className="eyebrow">ACCOUNT</p>
        <h2>Change password</h2>
        <label>
          Current password
          <input
            data-testid="current-password-input"
            type="password"
            value={cur}
            onChange={(e) => setCur(e.target.value)}
          />
        </label>
        <label>
          New password
          <input
            data-testid="new-password-input"
            type="password"
            value={nw}
            onChange={(e) => setNw(e.target.value)}
          />
        </label>
        <label>
          Confirm new password
          <input
            data-testid="confirm-password-input"
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
        </label>
        {err && <div className="error" data-testid="password-error">{err}</div>}
        {msg && <div className="hint" data-testid="password-success">{msg}</div>}
        <button
          data-testid="password-save-button"
          className="primary wide"
          disabled={busy || !cur || !nw || !confirm}
          onClick={submit}
        >
          Update password <ArrowRight size={16} />
        </button>
      </div>
    </div>
  );
}

/* -------------------- Owner Login -------------------- */
function Login({ setUser }) {
  const [email, setEmail] = useState("usman@taskflow.demo");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const submit = async (e) => {
    e.preventDefault();
    setError("");
    try {
      const r = await api.post("/auth/login", { email, password });
      localStorage.setItem("taskflow_token", r.data.token);
      setUser(r.data.user);
    } catch (x) {
      setError(x.response?.data?.detail || "Could not sign in");
    }
  };
  const google = () => {
    /* Emergent-managed Google auth: do not hardcode or add redirect params */
    window.location.href = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(
      window.location.origin + "/admin"
    )}`;
  };
  return (
    <div className="login-page">
      <div className="login-aside">
        <div className="brand light">
          <img src="/Favicon.png" alt="TaskFlow" className="brand-mark" />
          <span>Task<span>Flow</span></span>
        </div>
        <div>
          <p className="eyebrow">OWNER CONTROL CENTER</p>
          <h1>Make work<br /><em>move.</em></h1>
          <p>One calm place to assign, review, and finish the work that matters.</p>
        </div>
        <div className="login-stats">
          <b>03</b>
          <span>people ready to ship</span>
        </div>
      </div>
      <form className="login-card" onSubmit={submit}>
        <p className="eyebrow">WELCOME BACK</p>
        <h2>Owner sign in</h2>
        <p className="muted">Use your TaskFlow owner credentials to continue.</p>
        <label>
          Email
          <input
            data-testid="login-email-input"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            type="email"
            required
          />
        </label>
        <label>
          Password
          <input
            data-testid="login-password-input"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            type="password"
            required
          />
        </label>
        {error && (
          <div data-testid="login-error" className="error">
            {error}
          </div>
        )}
        <button data-testid="login-submit-button" className="primary wide">
          Enter workspace <ArrowRight size={17} />
        </button>
        <div className="or"><span>or</span></div>
        <button
          data-testid="google-login-button"
          type="button"
          className="google"
          onClick={google}
        >
          Continue with Google <span>G</span>
        </button>
        <p className="login-note">Two demo owners: Usman and Hena · seeded password</p>
      </form>
    </div>
  );
}

/* -------------------- Team View -------------------- */
function Team() {
  const { slug } = useParams();
  const nav = useNavigate();
  const [data, setData] = useState(null);
  const [members, setMembers] = useState([]);
  const [chosen, setChosen] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");

  const load = async (s) => {
    try {
      const r = await api.get(`/team/${s}`);
      setData(r.data);
      setError("");
    } catch {
      setData(null);
      setError("This team link is no longer active.");
    }
  };

  useEffect(() => {
    if (slug) load(slug);
    else {
      api.get("/team/members").then((r) => setMembers(r.data));
      setData(null);
    }
  }, [slug]);

  const openWithPin = async () => {
    setError("");
    try {
      const r = await api.post("/team/access", { member_id: chosen, pin });
      nav(`/team/${r.data.slug}`);
    } catch (e) {
      setError(e.response?.data?.detail || "Could not verify PIN");
    }
  };

  if (data) return <TeamBoard data={data} reload={() => load(data.member.slug)} />;

  return (
    <div className="login-page team-login">
      <div className="login-aside">
        <div className="brand light">
          <img src="/Favicon.png" alt="TaskFlow" className="brand-mark" />
          <span>Task<span>Flow</span></span>
        </div>
        <div>
          <p className="eyebrow">TEAM ACCESS</p>
          <h1>What are you<br /><em>working on?</em></h1>
          <p>Pick your name and enter your 4-digit PIN to open your private task board.</p>
        </div>
        <div className="login-stats">
          <b>{String(members.length || 0).padStart(2, "0")}</b>
          <span>teammates shipping today</span>
        </div>
      </div>
      <form
        className="login-card"
        onSubmit={(e) => {
          e.preventDefault();
          openWithPin();
        }}
      >
        <p className="eyebrow">WELCOME BACK</p>
        <h2>Open your board</h2>
        <p className="muted">Only you can see the tasks assigned to you.</p>
        <label>
          Your name
          <select
            data-testid="team-member-picker"
            value={chosen}
            onChange={(e) => setChosen(e.target.value)}
          >
            <option value="">Select your name</option>
            {members.map((m) => (
              <option key={m.member_id} value={m.member_id}>
                {m.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          4-digit PIN
          <input
            data-testid="team-pin-input"
            inputMode="numeric"
            maxLength="4"
            placeholder="••••"
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
          />
        </label>
        {error && (
          <div data-testid="team-access-error" className="error">
            {error}
          </div>
        )}
        <button
          data-testid="team-access-button"
          className="primary wide"
          disabled={!chosen || pin.length !== 4}
          type="submit"
        >
          Open my tasks <ArrowRight size={17} />
        </button>
        <div className="or"><span>or</span></div>
        <Link data-testid="team-owner-link" to="/login" className="google">
          Owner sign in <span>→</span>
        </Link>
        <p className="login-note">Have a direct link? Just open it — no PIN needed.</p>
      </form>
    </div>
  );
}

function TeamBoard({ data, reload }) {
  const [selected, setSelected] = useState(null);
  const [url, setUrl] = useState("");
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);

  const grouped = Object.fromEntries(statuses.map((s) => [s, data.tasks.filter((t) => t.status === s)]));

  const startTask = async (t) => {
    setBusy(true);
    await api.patch(`/team/${data.member.slug}/tasks/${t.id}/status`, { deliverable_url: "" });
    setBusy(false);
    reload();
    setSelected(null);
  };
  const submitForApproval = async (t) => {
    if (!url) return;
    setBusy(true);
    await api.patch(`/team/${data.member.slug}/tasks/${t.id}/status`, { deliverable_url: url });
    setBusy(false);
    setUrl("");
    reload();
    setSelected(null);
  };
  const addComment = async (t) => {
    if (!comment.trim()) return;
    const r = await api.post(`/team/${data.member.slug}/tasks/${t.id}/comments`, { comment });
    setComment("");
    setSelected((prev) => (prev ? { ...prev, comments: [...(prev.comments || []), r.data] } : prev));
    reload();
  };

  return (
    <div className="team-page">
      <header className="team-top">
        <div className="brand">
          <img src="/Favicon.png" alt="TaskFlow" className="brand-mark" />
          <span>Task<span>Flow</span></span>
        </div>
        <div className="member-chip" data-testid="team-member-chip">
          <span className="avatar">{data.member.name[0]}</span>
          <span>
            <b>{data.member.name}</b>
            <small>{data.member.classification} · private view</small>
          </span>
        </div>
      </header>
      <section className="team-hero">
        <div>
          <p className="eyebrow">
            YOUR WORKSPACE / {new Date().toLocaleDateString("en-US", { month: "long", day: "numeric" })}
          </p>
          <h1>Good work starts<br /><em>with clarity.</em></h1>
          <p>Here are the tasks currently in your lane. You're doing great.</p>
        </div>
        <div className="progress-ring" data-testid="team-completed-count">
          <strong>{data.tasks.filter((t) => t.status === "Completed").length}</strong>
          <span>completed</span>
        </div>
      </section>
      <div className="task-groups">
        {statuses.map((s) => (
          <section className="task-group" key={s}>
            <div className="group-head">
              <h2>{s}</h2>
              <span>{grouped[s].length}</span>
            </div>
            {grouped[s].map((t) => (
              <article
                data-testid={`team-task-${t.id}`}
                className="task-row"
                key={t.id}
                onClick={() => setSelected(t)}
              >
                <div className="priority-dot" data-priority={t.priority}></div>
                <div className="task-copy">
                  <b>{t.title}</b>
                  <p>{t.description || t.instructions || "No additional instructions"}</p>
                </div>
                <div className="task-meta">
                  <Badge status={t.status} />
                  <small>{fmt(t.deadline)}</small>
                </div>
                <ChevronRight size={16} />
              </article>
            ))}
            {!grouped[s].length && <div className="empty">Nothing here yet</div>}
          </section>
        ))}
      </div>

      {selected && (
        <div className="modal-wrap" onClick={() => setSelected(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <button
              data-testid="team-task-close"
              className="icon-btn close"
              onClick={() => setSelected(null)}
            >
              ×
            </button>
            <p className="eyebrow">TASK DETAIL</p>
            <h2>{selected.title}</h2>
            <Badge status={selected.status} />
            <p className="detail-text">{selected.description || selected.instructions}</p>
            <div className="detail-grid">
              <div>
                <small>DEADLINE</small>
                <b>{fmt(selected.deadline)}</b>
              </div>
              <div>
                <small>PRIORITY</small>
                <b>{selected.priority}</b>
              </div>
            </div>
            {selected.revision_feedback && (
              <div className="feedback" data-testid="team-revision-feedback">
                <b>Revision feedback</b>
                <p>{selected.revision_feedback}</p>
              </div>
            )}
            {selected.deliverable_url && (
              <p className="deliverable-line">
                <b>Deliverable:</b>{" "}
                <a href={selected.deliverable_url} target="_blank" rel="noreferrer">
                  {selected.deliverable_url}
                </a>
              </p>
            )}
            {selected.status === "Assigned" && (
              <button
                data-testid="start-task-button"
                className="primary wide"
                disabled={busy}
                onClick={() => startTask(selected)}
              >
                Start working <ArrowRight size={16} />
              </button>
            )}
            {selected.status === "Revision Required" && (
              <button
                data-testid="resume-task-button"
                className="primary wide"
                disabled={busy}
                onClick={() => startTask(selected)}
              >
                Move back to In Progress <ArrowRight size={16} />
              </button>
            )}
            {selected.status === "In Progress" && (
              <>
                <label>
                  Deliverable link
                  <input
                    data-testid="deliverable-url-input"
                    placeholder="https://..."
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                  />
                </label>
                <button
                  data-testid="submit-approval-button"
                  className="primary wide"
                  disabled={!url || busy}
                  onClick={() => submitForApproval(selected)}
                >
                  Submit for approval <ArrowRight size={17} />
                </button>
              </>
            )}
            <div className="comments">
              <h4>Comments</h4>
              {(selected.comments || []).map((c) => (
                <div className="comment" key={c.id}>
                  <b>{c.author}</b>
                  <span>{fmt(c.timestamp)}</span>
                  <p>{c.comment}</p>
                </div>
              ))}
              <div className="comment-form">
                <input
                  data-testid="team-comment-input"
                  placeholder="Add a comment"
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                />
                <button
                  data-testid="team-comment-submit"
                  className="ghost"
                  onClick={() => addComment(selected)}
                >
                  Send
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* -------------------- Owner: Overview -------------------- */
function AdminHome({ user }) {
  const [summary, setSummary] = useState(null);
  useEffect(() => {
    api.get("/admin/summary").then((r) => setSummary(r.data));
  }, []);
  return (
    <>
      <div className="admin-head">
        <div>
          <p className="eyebrow">
            OWNER OVERVIEW / {new Date().toLocaleDateString("en-US", { month: "long", day: "numeric" })}
          </p>
          <h1>Welcome back, {user?.name}.</h1>
          <p className="muted">Here's what needs your attention today.</p>
        </div>
        <Link data-testid="create-task-button" className="primary" to="/admin/tasks?new=1">
          <Plus size={17} /> New task
        </Link>
      </div>
      {summary ? (
        <>
          <div className="stat-grid">
            {[
              { label: "All tasks", value: summary.tasks.length, accent: "ink" },
              { label: "In progress", value: summary.counts["In Progress"], accent: "sage" },
              { label: "Awaiting approval", value: summary.pending, accent: "red" },
              { label: "Completed", value: summary.counts.Completed, accent: "sand" },
            ].map((s) => (
              <div
                data-testid={`stat-${s.label.toLowerCase().replaceAll(" ", "-")}`}
                className={`stat-card ${s.accent}`}
                key={s.label}
              >
                <span>{s.label}</span>
                <strong>{s.value}</strong>
                <small>this week</small>
              </div>
            ))}
          </div>
          <div className="dashboard-grid">
            <section className="dash-section" data-testid="approval-queue">
              <div className="section-title">
                <div>
                  <p className="eyebrow">NEEDS A LOOK</p>
                  <h2>Approval queue</h2>
                </div>
                <Link data-testid="view-all-approvals" to="/admin/tasks">
                  View all <ArrowRight size={14} />
                </Link>
              </div>
              {summary.tasks
                .filter((t) => t.status === "Pending Approval")
                .slice(0, 3)
                .map((t) => (
                  <div className="approval-row" key={t.id}>
                    <div className="avatar small">{t.assignee_name?.[0]}</div>
                    <div>
                      <b>{t.title}</b>
                      <small>
                        {t.assignee_name} · submitted {fmt(t.updated_at)}
                      </small>
                    </div>
                    <Badge status={t.status} />
                  </div>
                ))}
              {!summary.pending && <div className="empty large">Your approval queue is clear.</div>}
            </section>
            <section className="dash-section activity" data-testid="activity-feed">
              <div className="section-title">
                <div>
                  <p className="eyebrow">TEAM PULSE</p>
                  <h2>Recent activity</h2>
                </div>
              </div>
              {summary.recent.map((a) => (
                <div className="activity-row" key={a.id}>
                  <span className="activity-dot"></span>
                  <div>
                    <b>
                      {a.actor}{" "}
                      <span>
                        {a.from_status} → {a.to_status.toLowerCase()}
                      </span>
                    </b>
                    <small>
                      {a.note || a.task_id} · {fmt(a.timestamp)}
                    </small>
                  </div>
                </div>
              ))}
              {!summary.recent?.length && <div className="empty large">No recent activity.</div>}
            </section>
          </div>
        </>
      ) : (
        <div className="loading">Loading workspace…</div>
      )}
    </>
  );
}

/* -------------------- Owner: Tasks (kanban/list + create/edit/approve/reject) -------------------- */
function TaskModal({ initial, members, onClose, onSave }) {
  const [f, setF] = useState(
    initial || {
      title: "",
      description: "",
      instructions: "",
      assignee_id: members[0]?.member_id || "",
      deadline: "",
      priority: "Medium",
    }
  );
  useEffect(() => {
    if (!initial && !f.assignee_id && members[0]) {
      setF((prev) => ({ ...prev, assignee_id: members[0].member_id }));
    }
  }, [members, initial, f.assignee_id]);
  return (
    <div className="modal-wrap" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <button data-testid="task-modal-close" className="icon-btn close" onClick={onClose}>
          ×
        </button>
        <p className="eyebrow">{initial ? "EDIT TASK" : "NEW TASK"}</p>
        <h2>{initial ? "Update task" : "Assign new task"}</h2>
        <label>
          Title
          <input
            data-testid="task-title-input"
            value={f.title}
            onChange={(e) => setF({ ...f, title: e.target.value })}
          />
        </label>
        <label>
          Description
          <input
            data-testid="task-description-input"
            value={f.description}
            onChange={(e) => setF({ ...f, description: e.target.value })}
          />
        </label>
        <label>
          Instructions
          <input
            data-testid="task-instructions-input"
            value={f.instructions}
            onChange={(e) => setF({ ...f, instructions: e.target.value })}
          />
        </label>
        <div className="row-two">
          <label>
            Assignee
            <select
              data-testid="task-assignee-select"
              value={f.assignee_id}
              onChange={(e) => setF({ ...f, assignee_id: e.target.value })}
            >
              {members.map((m) => (
                <option key={m.member_id} value={m.member_id}>
                  {`${m.name} — ${m.classification}`}
                </option>
              ))}
            </select>
          </label>
          <label>
            Priority
            <select
              data-testid="task-priority-select"
              value={f.priority}
              onChange={(e) => setF({ ...f, priority: e.target.value })}
            >
              {priorities.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label>
          Deadline
          <input
            data-testid="task-deadline-input"
            type="date"
            value={f.deadline?.slice(0, 10) || ""}
            onChange={(e) => setF({ ...f, deadline: e.target.value })}
          />
        </label>
        <button
          data-testid="task-save-button"
          className="primary wide"
          disabled={!f.title || !f.assignee_id || !f.deadline}
          onClick={() => onSave(f)}
        >
          {initial ? "Save changes" : "Create task"} <ArrowRight size={17} />
        </button>
      </div>
    </div>
  );
}

function AdminTasks() {
  const loc = useLocation();
  const nav = useNavigate();
  const [tasks, setTasks] = useState([]);
  const [members, setMembers] = useState([]);
  const [view, setView] = useState("kanban");
  const [filter, setFilter] = useState("All");
  const [assignee, setAssignee] = useState("All");
  const [showNew, setShowNew] = useState(false);
  const [editing, setEditing] = useState(null);
  const [rejecting, setRejecting] = useState(null);
  const [rejectFeedback, setRejectFeedback] = useState("");

  const load = async () => {
    const [s, m] = await Promise.all([api.get("/admin/summary"), api.get("/admin/team")]);
    setTasks(s.data.tasks);
    setMembers(m.data);
  };
  useEffect(() => {
    load();
    if (new URLSearchParams(loc.search).get("new") === "1") setShowNew(true);
  }, [loc.search]);

  const create = async (f) => {
    await api.post("/admin/tasks", f);
    setShowNew(false);
    nav("/admin/tasks");
    load();
  };
  const save = async (f) => {
    await api.patch(`/admin/tasks/${editing.id}`, f);
    setEditing(null);
    load();
  };
  const remove = async (t) => {
    if (!window.confirm(`Delete "${t.title}"?`)) return;
    await api.delete(`/admin/tasks/${t.id}`);
    load();
  };
  const approve = async (t) => {
    await api.post(`/admin/tasks/${t.id}/approve`);
    load();
  };
  const reject = async () => {
    if (!rejectFeedback.trim()) return;
    await api.post(`/admin/tasks/${rejecting.id}/reject`, { feedback: rejectFeedback });
    setRejecting(null);
    setRejectFeedback("");
    load();
  };

  const scoped = assignee === "All" ? tasks : tasks.filter((t) => t.assignee_id === assignee);
  const filtered = filter === "All" ? scoped : scoped.filter((t) => t.status === filter);

  return (
    <>
      <div className="admin-head">
        <div>
          <p className="eyebrow">TASK BOARD</p>
          <h1>All tasks</h1>
          <p className="muted">Assign, review, approve. Every change is logged.</p>
        </div>
        <button
          data-testid="new-task-button"
          className="primary"
          onClick={() => setShowNew(true)}
        >
          <Plus size={17} /> New task
        </button>
      </div>
      <div className="board-controls">
        <div className="toggle">
          <button
            data-testid="toggle-kanban"
            className={view === "kanban" ? "on" : ""}
            onClick={() => setView("kanban")}
          >
            Kanban
          </button>
          <button
            data-testid="toggle-list"
            className={view === "list" ? "on" : ""}
            onClick={() => setView("list")}
          >
            List
          </button>
        </div>
        <div className="filters">
          <select
            data-testid="filter-assignee"
            value={assignee}
            onChange={(e) => setAssignee(e.target.value)}
          >
            <option value="All">Everyone</option>
            {members.map((m) => (
              <option key={m.member_id} value={m.member_id}>
                {m.name}
              </option>
            ))}
          </select>
          <select
            data-testid="filter-status"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          >
            <option value="All">All statuses</option>
            {statuses.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
      </div>

      {view === "kanban" ? (
        <div className="kanban">
          {statuses.map((s) => (
            <div className="kanban-col" key={s} data-testid={`kanban-col-${s.toLowerCase().replaceAll(" ", "-")}`}>
              <div className="kanban-head">
                <h3>{s}</h3>
                <span>{scoped.filter((t) => t.status === s).length}</span>
              </div>
              {scoped
                .filter((t) => t.status === s)
                .map((t) => (
                  <div className="kanban-card" key={t.id} data-testid={`admin-task-${t.id}`}>
                    <div className="k-title">
                      <b>{t.title}</b>
                      <div className="k-actions">
                        <button
                          data-testid={`edit-task-${t.id}`}
                          className="icon-btn"
                          onClick={() => setEditing(t)}
                          aria-label="Edit"
                        >
                          <Pencil size={13} />
                        </button>
                        <button
                          data-testid={`delete-task-${t.id}`}
                          className="icon-btn"
                          onClick={() => remove(t)}
                          aria-label="Delete"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                    <p className="k-desc">{t.description}</p>
                    <div className="k-meta">
                      <span>{t.assignee_name}</span>
                      <span className="k-priority">
                        <span className="priority-dot" data-priority={t.priority}></span>
                        {t.priority}
                      </span>
                      <span>{fmt(t.deadline)}</span>
                    </div>
                    {t.deliverable_url && (
                      <a
                        className="k-link"
                        href={t.deliverable_url}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Deliverable ↗
                      </a>
                    )}
                    {t.status === "Pending Approval" && (
                      <div className="k-approve">
                        <button
                          data-testid={`approve-task-${t.id}`}
                          className="approve"
                          onClick={() => approve(t)}
                        >
                          <Check size={13} /> Approve
                        </button>
                        <button
                          data-testid={`reject-task-${t.id}`}
                          className="reject"
                          onClick={() => setRejecting(t)}
                        >
                          <X size={13} /> Revise
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              {!scoped.filter((t) => t.status === s).length && (
                <div className="empty">Empty</div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <table className="task-table">
          <thead>
            <tr>
              <th>Title</th>
              <th>Assignee</th>
              <th>Status</th>
              <th>Priority</th>
              <th>Deadline</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((t) => (
              <tr key={t.id} data-testid={`row-task-${t.id}`}>
                <td>{t.title}</td>
                <td>{t.assignee_name}</td>
                <td>
                  <Badge status={t.status} />
                </td>
                <td>{t.priority}</td>
                <td>{fmt(t.deadline)}</td>
                <td className="row-actions">
                  {t.status === "Pending Approval" && (
                    <>
                      <button
                        data-testid={`row-approve-${t.id}`}
                        className="approve"
                        onClick={() => approve(t)}
                      >
                        Approve
                      </button>
                      <button
                        data-testid={`row-reject-${t.id}`}
                        className="reject"
                        onClick={() => setRejecting(t)}
                      >
                        Revise
                      </button>
                    </>
                  )}
                  <button
                    data-testid={`row-edit-${t.id}`}
                    className="ghost"
                    onClick={() => setEditing(t)}
                  >
                    Edit
                  </button>
                  <button
                    data-testid={`row-delete-${t.id}`}
                    className="ghost"
                    onClick={() => remove(t)}
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
            {!filtered.length && (
              <tr>
                <td colSpan="6" className="empty">
                  No tasks match this filter.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      )}

      {showNew && (
        <TaskModal members={members} onClose={() => setShowNew(false)} onSave={create} />
      )}
      {editing && (
        <TaskModal
          initial={editing}
          members={members}
          onClose={() => setEditing(null)}
          onSave={save}
        />
      )}
      {rejecting && (
        <div className="modal-wrap" onClick={() => setRejecting(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <button className="icon-btn close" onClick={() => setRejecting(null)}>
              ×
            </button>
            <p className="eyebrow">REVISION FEEDBACK</p>
            <h2>Send back to {rejecting.assignee_name}</h2>
            <label>
              What needs to change?
              <input
                data-testid="reject-feedback-input"
                value={rejectFeedback}
                onChange={(e) => setRejectFeedback(e.target.value)}
                placeholder="Explain the required revision"
              />
            </label>
            <button
              data-testid="reject-confirm-button"
              className="primary wide"
              disabled={!rejectFeedback.trim()}
              onClick={reject}
            >
              Request revision <ArrowRight size={17} />
            </button>
          </div>
        </div>
      )}
    </>
  );
}

/* -------------------- Owner: Team -------------------- */
function AdminTeam() {
  const [team, setTeam] = useState([]);
  const [name, setName] = useState("");
  const [cls, setCls] = useState("Junior");
  const [rotated, setRotated] = useState(null);
  const [rotatingId, setRotatingId] = useState(null);
  const [pinPanel, setPinPanel] = useState(null);
  const [pinValue, setPinValue] = useState("");
  const [pinError, setPinError] = useState("");
  const [pinSaving, setPinSaving] = useState(false);

  const load = () => api.get("/admin/team").then((r) => setTeam(r.data));
  useEffect(() => {
    load();
  }, []);

  const add = async () => {
    if (!name.trim()) return;
    const r = await api.post("/admin/team", { name, classification: cls });
    setName("");
    setRotated(r.data);
    load();
  };

  const rotate = async (m) => {
    if (!window.confirm(`Rotate ${m.name}'s access? Their current link and PIN will stop working immediately.`)) return;
    setRotatingId(m.member_id);
    try {
      const r = await api.post(`/admin/team/${m.member_id}/rotate`);
      setRotated(r.data);
      load();
    } finally {
      setRotatingId(null);
    }
  };

  const copyLink = (slug) => {
    const url = `${window.location.origin}/team/${slug}`;
    navigator.clipboard?.writeText(url);
  };

  const toggleActive = async (m) => {
    const verb = m.active ? "Deactivate" : "Reactivate";
    if (!window.confirm(`${verb} ${m.name}? ${m.active ? "Their access link and PIN will stop working." : "Their previous access link and PIN will work again."}`)) return;
    await api.post(`/admin/team/${m.member_id}/toggle`);
    load();
  };

  const removeMember = async (m) => {
    if (!window.confirm(`Permanently delete ${m.name}? This cannot be undone. Their existing tasks will keep showing their name, but their access link and PIN stop working immediately.`)) return;
    await api.delete(`/admin/team/${m.member_id}`);
    load();
  };

  const openPin = async (m) => {
    setPinPanel(m);
    setPinError("");
    setPinValue("");
    const r = await api.get(`/admin/team/${m.member_id}/pin`);
    setPinValue(r.data.pin);
  };

  const savePin = async () => {
    if (!/^\d{4}$/.test(pinValue)) {
      setPinError("PIN must be exactly 4 digits");
      return;
    }
    setPinSaving(true);
    setPinError("");
    try {
      await api.post(`/admin/team/${pinPanel.member_id}/pin`, { pin: pinValue });
      setPinPanel(null);
    } catch (e) {
      setPinError(e.response?.data?.detail || "Could not set PIN");
    } finally {
      setPinSaving(false);
    }
  };

  return (
    <>
      <div className="admin-head">
        <div>
          <p className="eyebrow">TEAM DIRECTORY</p>
          <h1>Team members</h1>
          <p className="muted">Generate access links and rotate credentials in one tap.</p>
        </div>
      </div>
      <section className="dash-section" data-testid="team-directory">
        <div className="team-add">
          <input
            data-testid="new-member-name"
            placeholder="Full name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <select
            data-testid="new-member-class"
            value={cls}
            onChange={(e) => setCls(e.target.value)}
          >
            <option value="Junior">Junior</option>
            <option value="Senior">Senior</option>
          </select>
          <button data-testid="add-member-button" className="primary" onClick={add}>
            <Plus size={15} /> Add member
          </button>
        </div>
        <table className="task-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Classification</th>
              <th>Access link</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {team.map((m) => (
              <tr key={m.member_id} data-testid={`team-row-${m.member_id}`}>
                <td>{m.name}</td>
                <td>{m.classification}</td>
                <td>
                  <code>/team/{m.slug}</code>{" "}
                  <button
                    className="ghost"
                    data-testid={`copy-link-${m.member_id}`}
                    onClick={() => copyLink(m.slug)}
                    title="Copy link"
                  >
                    <Copy size={12} />
                  </button>
                </td>
                <td>{m.active ? "Active" : "Paused"}</td>
                <td className="row-actions">
                  <button
                    data-testid={`view-pin-${m.member_id}`}
                    className="ghost"
                    onClick={() => openPin(m)}
                  >
                    <KeyRound size={12} /> PIN
                  </button>
                  <button
                    data-testid={`rotate-access-${m.member_id}`}
                    className="ghost"
                    disabled={rotatingId === m.member_id}
                    onClick={() => rotate(m)}
                  >
                    <RotateCw size={12} /> Rotate access
                  </button>
                  <button
                    data-testid={`toggle-active-${m.member_id}`}
                    className="ghost"
                    onClick={() => toggleActive(m)}
                  >
                    {m.active ? (
                      <>
                        <UserX size={12} /> Deactivate
                      </>
                    ) : (
                      <>
                        <UserCheck size={12} /> Reactivate
                      </>
                    )}
                  </button>
                  <button
                    data-testid={`delete-member-${m.member_id}`}
                    className="ghost"
                    onClick={() => removeMember(m)}
                  >
                    <Trash2 size={12} /> Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      {rotated && (
        <div className="modal-wrap" onClick={() => setRotated(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <button
              data-testid="rotated-close"
              className="icon-btn close"
              onClick={() => setRotated(null)}
            >
              ×
            </button>
            <p className="eyebrow">{rotated.created_at ? "NEW MEMBER" : "NEW ACCESS"} FOR {rotated.name.toUpperCase()}</p>
            <h2>Share these once</h2>
            <p className="muted">
              {rotated.created_at
                ? "Send these to " + rotated.name + " securely so they can open their board."
                : "The previous link and PIN no longer work. Send these to " + rotated.name + " securely."}
            </p>
            <div className="rotated-block">
              <div>
                <small>LINK</small>
                <b data-testid="rotated-slug">/team/{rotated.slug}</b>
              </div>
              <div>
                <small>PIN</small>
                <b data-testid="rotated-pin">{rotated.pin}</b>
              </div>
            </div>
            <button
              className="primary wide"
              data-testid="rotated-copy"
              onClick={() => copyLink(rotated.slug)}
            >
              Copy full link <Copy size={15} />
            </button>
          </div>
        </div>
      )}
      {pinPanel && (
        <div className="modal-wrap" onClick={() => setPinPanel(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <button
              data-testid="pin-panel-close"
              className="icon-btn close"
              onClick={() => setPinPanel(null)}
            >
              ×
            </button>
            <p className="eyebrow">ACCESS PIN FOR {pinPanel.name.toUpperCase()}</p>
            <h2>View or set PIN</h2>
            <p className="muted">This is the 4-digit PIN {pinPanel.name} uses with their access link. Change it to set a custom code.</p>
            <label>
              4-digit PIN
              <input
                data-testid="pin-panel-input"
                inputMode="numeric"
                maxLength="4"
                value={pinValue}
                onChange={(e) => setPinValue(e.target.value.replace(/\D/g, ""))}
              />
            </label>
            {pinError && (
              <div data-testid="pin-panel-error" className="error">
                {pinError}
              </div>
            )}
            <button
              className="primary wide"
              data-testid="pin-panel-save"
              disabled={pinSaving || pinValue.length !== 4}
              onClick={savePin}
            >
              {pinSaving ? "Saving…" : "Save PIN"}
            </button>
          </div>
        </div>
      )}
    </>
  );
}

/* -------------------- Owner: Weekly Digest -------------------- */
function AdminDigest() {
  const [data, setData] = useState(null);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState("");

  const load = () => api.get("/admin/digest").then((r) => setData(r.data)).catch(() => setData(null));
  useEffect(() => {
    load();
  }, []);

  const send = async () => {
    setSending(true);
    setResult("");
    try {
      const r = await api.post("/admin/digest/send");
      const failed = r.data.sent.filter((s) => !s.ok);
      const okCount = r.data.sent.length - failed.length;
      let msg = `Sent to ${okCount} of ${r.data.sent.length} owners.`;
      if (failed.length) msg += " " + failed.map((f) => `${f.email}: ${f.error}`).join(" ");
      setResult(msg);
    } catch (e) {
      setResult(e.response?.data?.detail || "Could not send digest.");
    }
    setSending(false);
  };

  if (!data) return <div className="loading">Loading digest…</div>;
  return (
    <>
      <div className="admin-head">
        <div>
          <p className="eyebrow">WEEKLY DIGEST · MONDAY 09:00 UTC</p>
          <h1>This week at a glance</h1>
          <p className="muted">
            Preview what owners see in their Monday email.{" "}
            {data.email_configured
              ? "Resend is configured. Delivery still depends on your Resend account's sending limits."
              : "Set RESEND_API_KEY in backend/.env to enable email delivery."}
          </p>
        </div>
        <button
          data-testid="send-digest-button"
          className="primary"
          onClick={send}
          disabled={sending || !data.email_configured}
          title={data.email_configured ? "Send now" : "Configure Resend to enable"}
        >
          <Send size={15} /> {sending ? "Sending…" : "Send now"}
        </button>
      </div>
      {result && <div className="hint" data-testid="digest-result">{result}</div>}
      <div className="stat-grid">
        <div className="stat-card red" data-testid="digest-overdue">
          <span>Overdue</span>
          <strong>{data.totals.overdue}</strong>
          <small>past deadline</small>
        </div>
        <div className="stat-card sand" data-testid="digest-pending">
          <span>Awaiting approval</span>
          <strong>{data.totals.pending}</strong>
          <small>needs a look</small>
        </div>
        <div className="stat-card sage" data-testid="digest-completed">
          <span>Completed this week</span>
          <strong>{data.totals.completed_this_week}</strong>
          <small>last 7 days</small>
        </div>
      </div>
      <section className="dash-section" data-testid="digest-by-member">
        <div className="section-title">
          <div>
            <p className="eyebrow">BY TEAMMATE</p>
            <h2>Where things stand</h2>
          </div>
        </div>
        <table className="task-table">
          <thead>
            <tr>
              <th>Member</th>
              <th>In progress</th>
              <th>Pending</th>
              <th>Completed</th>
              <th>Overdue</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(data.by_member).map(([m, v]) => (
              <tr key={m} data-testid={`digest-row-${m.toLowerCase().replaceAll(" ", "-")}`}>
                <td>{m}</td>
                <td>{v.in_progress}</td>
                <td>{v.pending}</td>
                <td>{v.completed}</td>
                <td style={{ color: v.overdue ? "#8e2925" : "inherit" }}>{v.overdue}</td>
              </tr>
            ))}
            {!Object.keys(data.by_member).length && (
              <tr>
                <td colSpan="5" className="empty">
                  No activity yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </>
  );
}

/* -------------------- Owner: Finance -------------------- */
function AdminFinance() {
  const [data, setData] = useState(null);
  useEffect(() => {
    api.get("/admin/financials").then((r) => setData(r.data));
  }, []);
  if (!data) return <div className="loading">Loading finance…</div>;
  return (
    <>
      <div className="admin-head">
        <div>
          <p className="eyebrow">OWNER · PRIVATE</p>
          <h1>Finance & reports</h1>
          <p className="muted">
            Restricted to owners. Never exposed to team-member routes.
          </p>
        </div>
      </div>
      <div className="stat-grid">
        <div className="stat-card ink" data-testid="stat-completion-rate">
          <span>Completion rate</span>
          <strong>{data.reports.completion_rate}%</strong>
          <small>rolling 30 days</small>
        </div>
        <div className="stat-card sage" data-testid="stat-avg-turnaround">
          <span>Avg. turnaround</span>
          <strong>{data.reports.avg_turnaround}</strong>
          <small>per task</small>
        </div>
      </div>
      <div className="dashboard-grid">
        <section className="dash-section" data-testid="payments-table">
          <div className="section-title">
            <div>
              <p className="eyebrow">PAYMENTS</p>
              <h2>Recent payouts</h2>
            </div>
          </div>
          <table className="task-table">
            <thead>
              <tr>
                <th>Member</th>
                <th>Period</th>
                <th>Amount</th>
                <th>State</th>
              </tr>
            </thead>
            <tbody>
              {data.payments.map((p, i) => (
                <tr key={i}>
                  <td>{p.member}</td>
                  <td>{p.period}</td>
                  <td>${p.amount}</td>
                  <td>{p.state}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
        <section className="dash-section" data-testid="rates-table">
          <div className="section-title">
            <div>
              <p className="eyebrow">RATES</p>
              <h2>Hourly rates</h2>
            </div>
          </div>
          <table className="task-table">
            <thead>
              <tr>
                <th>Member</th>
                <th>Rate</th>
              </tr>
            </thead>
            <tbody>
              {data.rates.map((r, i) => (
                <tr key={i}>
                  <td>{r.member}</td>
                  <td>${r.rate}/hr</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="hint" data-testid="budget-note">{data.budget_note}</p>
        </section>
      </div>
    </>
  );
}

/* -------------------- Owner: Audit -------------------- */
function AdminAudit() {
  const [log, setLog] = useState([]);
  useEffect(() => {
    api.get("/admin/audit").then((r) => setLog(r.data));
  }, []);
  return (
    <>
      <div className="admin-head">
        <div>
          <p className="eyebrow">HISTORY</p>
          <h1>Audit trail</h1>
          <p className="muted">Every status change, with who and when.</p>
        </div>
      </div>
      <section className="dash-section" data-testid="audit-log">
        <table className="task-table">
          <thead>
            <tr>
              <th>Actor</th>
              <th>Task</th>
              <th>From</th>
              <th>To</th>
              <th>Note</th>
              <th>When</th>
            </tr>
          </thead>
          <tbody>
            {log.map((a) => (
              <tr key={a.id} data-testid={`audit-row-${a.id}`}>
                <td>{a.actor}</td>
                <td><code>{a.task_id}</code></td>
                <td>{a.from_status}</td>
                <td>
                  <Badge status={a.to_status === "—" ? "Assigned" : a.to_status} />
                </td>
                <td>{a.note || "—"}</td>
                <td>{new Date(a.timestamp).toLocaleString("en-US")}</td>
              </tr>
            ))}
            {!log.length && (
              <tr>
                <td colSpan="6" className="empty">
                  Nothing logged yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </>
  );
}

/* -------------------- Google callback -------------------- */
function AuthCallback({ setUser }) {
  const [error, setError] = useState("");
  const nav = useNavigate();
  useEffect(() => {
    const id = new URLSearchParams(window.location.hash.slice(1)).get("session_id");
    if (!id) {
      nav("/login", { replace: true });
      return;
    }
    api
      .post("/auth/google/session", { session_id: id })
      .then((r) => {
        localStorage.setItem("taskflow_token", r.data.token);
        setUser(r.data.user);
        window.history.replaceState({}, "", window.location.pathname);
        nav("/admin", { replace: true });
      })
      .catch((e) => setError(e.response?.data?.detail || "Google sign-in failed"));
  }, [setUser, nav]);
  return <div className="loading">{error || "Verifying owner access…"}</div>;
}

/* -------------------- Root -------------------- */
function App() {
  const [user, setUser] = useState(null);
  const [checking, setChecking] = useState(true);
  useEffect(() => {
    if (window.location.hash.includes("session_id=")) {
      setChecking(false);
      return;
    }
    const token = localStorage.getItem("taskflow_token");
    if (!token) {
      setChecking(false);
      return;
    }
    api
      .get("/auth/me")
      .then((r) => {
        setUser(r.data);
        setChecking(false);
      })
      .catch(() => {
        localStorage.removeItem("taskflow_token");
        setChecking(false);
      });
  }, []);

  const logout = async () => {
    localStorage.removeItem("taskflow_token");
    try {
      await api.post("/auth/logout");
    } catch {}
    setUser(null);
  };

  if (checking) return <div className="loading">Opening TaskFlow…</div>;
  if (window.location.hash.includes("session_id=")) return <AuthCallback setUser={setUser} />;

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/admin" replace /> : <Login setUser={setUser} />} />
      <Route path="/team/:slug" element={<Team />} />
      <Route path="/" element={<Team />} />
      <Route
        path="/admin"
        element={user ? <Shell user={user} onLogout={logout} /> : <Navigate to="/login" replace />}
      >
        <Route index element={<AdminHome user={user} />} />
        <Route path="tasks" element={<AdminTasks />} />
        <Route path="team" element={<AdminTeam />} />
        <Route path="digest" element={<AdminDigest />} />
        <Route path="finance" element={<AdminFinance />} />
        <Route path="audit" element={<AdminAudit />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function Root() {
  return (
    <BrowserRouter>
      <App />
    </BrowserRouter>
  );
}
