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
    <main className="min-h-screen bg-slate-950 text-slate-100 px-4 py-10">
      <div className="mx-auto w-full max-w-6xl space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Users (Moderator)</h1>
            <p className="text-sm text-slate-400">View accounts and update roles.</p>
          </div>
          <Link href="/" className="text-sm text-blue-400 hover:text-blue-300">
            ← Back to app
          </Link>
        </div>

        {error && (
          <div className="rounded-lg border border-red-500/50 bg-red-500/10 px-3 py-2 text-sm text-red-200">
            {error}
          </div>
        )}

        <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4 space-y-3">
          <div className="overflow-x-auto">
            <table className="min-w-full text-xs text-slate-200">
              <thead>
                <tr className="text-left text-slate-400">
                  <th className="px-2 py-1">Email</th>
                  <th className="px-2 py-1">Name</th>
                  <th className="px-2 py-1">Role</th>
                  <th className="px-2 py-1">Tokens</th>
                  <th className="px-2 py-1">Actions</th>
                </tr>
              </thead>
              <tbody>
                {list.map((u) => (
                  <tr key={u.id} className="border-t border-slate-800">
                    <td className="px-2 py-1">{u.email}</td>
                    <td className="px-2 py-1">{u.name || "-"}</td>
                  <td className="px-2 py-1">{u.role}</td>
                  <td className="px-2 py-1">{u.tokensRemaining}</td>
                  <td className="px-2 py-1">
                    <div className="flex flex-wrap gap-2">
                      {["FREE", "PREMIUM", "MODERATOR", "ADMIN"].map((role) => (
                        <button
                          key={role}
                          type="button"
                          disabled={busyId === u.id || !canEdit}
                          onClick={() => updateRole(u.id, role)}
                          className={`rounded-lg px-2 py-1 text-[11px] font-semibold ${
                            u.role === role
                              ? "bg-blue-600 text-white"
                              : "bg-slate-800 text-slate-100 hover:bg-slate-700"
                          } disabled:opacity-50`}
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
                    <td colSpan={5} className="px-2 py-3 text-center text-slate-500">
                      No users found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
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
