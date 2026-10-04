import Link from "next/link";
import { trackCtaClick } from "../lib/analytics";
import { gteApi } from "../lib/gteApi";
import type { EditorListItem } from "../types/gte";

type SidebarSection = "home" | "transcriber" | "tabs" | "shared";

function SidebarIcon({ name }: { name: SidebarSection }) {
  if (name === "home") {
    return <svg viewBox="0 0 20 20" aria-hidden="true"><path d="m3.5 9 6.5-5.5L16.5 9v7.5h-5v-4h-3v4h-5Z" /></svg>;
  }
  if (name === "transcriber") {
    return <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4 10h2m2-4v8m3-11v14m3-10v6m3-3h-1" /></svg>;
  }
  if (name === "shared") {
    return (
      <svg viewBox="0 0 20 20" aria-hidden="true">
        <circle cx="15" cy="4.5" r="2" />
        <circle cx="5" cy="10" r="2" />
        <circle cx="15" cy="15.5" r="2" />
        <path d="M6.7 8.8 13.3 5.7M6.7 11.2l6.6 3.1" />
      </svg>
    );
  }
  return <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3.5 5.5h13m-13 4.5h13m-13 4.5h8" /></svg>;
}

const editorName = (editor: EditorListItem) => editor.name?.trim() || "Untitled tab";

type WorkspaceSidebarProps = {
  active: SidebarSection;
  recentEditors: EditorListItem[];
  loading: boolean;
  isPremium: boolean;
  analyticsSurface: string;
};

export default function WorkspaceSidebar({
  active,
  recentEditors,
  loading,
  isPremium,
  analyticsSurface,
}: WorkspaceSidebarProps) {
  const track = (cta: string) =>
    trackCtaClick(cta, { surface: analyticsSurface, plan: isPremium ? "premium" : "free" });

  return (
    <aside className="product-studio-sidebar" aria-label="Workspace navigation">
      <nav>
        <Link href="/home" className={active === "home" ? "is-active" : undefined} onClick={() => track(`${analyticsSurface}_sidebar_home`)}>
          <SidebarIcon name="home" />
          Home
        </Link>
        <Link href="/transcribe" className={active === "transcriber" ? "is-active" : undefined} onClick={() => track(`${analyticsSurface}_sidebar_transcribe`)}>
          <SidebarIcon name="transcriber" />
          Transcriber
        </Link>
        <Link href="/gte" className={active === "tabs" ? "is-active" : undefined} onClick={() => track(`${analyticsSurface}_sidebar_editors`)}>
          <SidebarIcon name="tabs" />
          My tabs
        </Link>
        <Link href="/shared" className={active === "shared" ? "is-active" : undefined} onClick={() => track(`${analyticsSurface}_sidebar_shared`)}>
          <SidebarIcon name="shared" />
          Shared with you
        </Link>
      </nav>
      <div className="product-studio-sidebar__recent">
        <header>
          <span>Recent tabs</span>
          <Link href="/gte">View all</Link>
        </header>
        {recentEditors.slice(0, 4).map((editor) => (
          <Link
            key={editor.id}
            href={`/gte/${editor.id}`}
            onPointerDown={() => void gteApi.prefetchEditor(editor.id).catch(() => {})}
          >
            {editorName(editor)}
          </Link>
        ))}
        {!loading && recentEditors.length === 0 && <small>No tabs yet</small>}
      </div>
      {!isPremium && (
        <Link
          className="product-studio-sidebar__premium"
          href="/pricing?source=product_home"
          onClick={() => track(`${analyticsSurface}_sidebar_premium`)}
        >
          <strong>Premium</strong>
          <span>More credits and full-song uploads</span>
          <i>Explore →</i>
        </Link>
      )}
    </aside>
  );
}
