import { GetServerSideProps } from "next";
import Link from "next/link";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../api/auth/[...nextauth]";
import { prisma } from "../../lib/prisma";
import { useState } from "react";

type UserRow = {
  id: string;
  email: string;
  name: string | null;
  role: string;
  tokensRemaining: number;
};

type Props = {
  users: UserRow[];
  canEdit: boolean;
};

export default function UsersAdminPage({ users, canEdit }: Props) {
  const [list, setList] = useState(users);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const updateRole = async (id: string, role: string) => {
    if (!canEdit) return;
    setBusyId(id);
    setError(null);
    try {
      const res = await fetch("/api/mod/update-role", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, role }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error || "Could not update role.");
      } else {
        setList((prev) => prev.map((u) => (u.id === id ? { ...u, role } : u)));
      }
    } catch (err: any) {
      setError(err?.message || "Could not update role.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <main className="page">
      <div className="container stack">
        <div className="page-header">
          <div>
            <h1 className="page-title">Users (Moderator)</h1>
            <p className="page-subtitle">View accounts and update roles.</p>
          </div>
          <Link href="/" className="button-ghost button-small">
            Back to app
          </Link>
        </div>

        {error && <div className="error">{error}</div>}

        <section className="card">
          <div className="card-outline" style={{ overflowX: "auto" }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Email</th>
                  <th>Name</th>
                  <th>Role</th>
                  <th>Tokens</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {list.map((u) => (
                  <tr key={u.id}>
                    <td>{u.email}</td>
                    <td>{u.name || "-"}</td>
                    <td>{u.role}</td>
                    <td>{u.tokensRemaining}</td>
                    <td>
                      <div className="button-row">
                        {[
                          "FREE",
                          "PREMIUM",
                          "MODERATOR",
                          "ADMIN",
                        ].map((role) => (
                          <button
                            key={role}
                            type="button"
                            disabled={busyId === u.id || !canEdit}
                            onClick={() => updateRole(u.id, role)}
                            className={`button-small ${
                              u.role === role ? "button-primary" : "button-secondary"
                            }`}
                          >
                            {role}
                          </button>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
                {list.length === 0 && (
                  <tr>
                    <td colSpan={5} className="muted text-small" style={{ textAlign: "center" }}>
                      No users found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}

export const getServerSideProps: GetServerSideProps = async (ctx) => {
  const session = await getServerSession(ctx.req, ctx.res, authOptions);
  const role = session?.user?.role || "";
  if (!session?.user?.id || (role !== "ADMIN" && role !== "MODERATOR" && role !== "MOD")) {
    return {
      redirect: {
        destination: "/",
        permanent: false,
      },
    };
  }

  const users = await prisma.user.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      tokensRemaining: true,
    },
  });

  return {
    props: {
      users: users.map((u) => ({ ...u })),
      canEdit: role === "ADMIN",
    },
  };
};
