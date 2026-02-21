import type { GetServerSideProps } from "next";
import Head from "next/head";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../../api/auth/[...nextauth]";
import { useRouter } from "next/router";
import { slugify } from "../../../lib/slug";
import { renderMarkdown, renderPlainText } from "../../../lib/markdown";

type TaxonomyItem = {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
};

type ClusterSelection = {
  id: string;
  isPillar: boolean;
};

type PostForm = {
  id?: string;
  title: string;
  slug: string;
  excerpt: string;
  content: string;
  contentMode: "PLAIN" | "LATEX";
  coverImageUrl: string;
  seoTitle: string;
  seoDescription: string;
  canonicalUrl: string;
  status: "DRAFT" | "SCHEDULED" | "PUBLISHED";
  publishAt: string;
  categories: string[];
  tags: string[];
  clusters: ClusterSelection[];
};

type PostListItem = {
  id: string;
  title: string;
  slug: string;
  status: string;
  updatedAt: string;
};

type Props = {
  isAdmin: boolean;
};

const readJsonSafe = async (res: Response) => {
  const contentType = res.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) return null;
  try {
    return await res.json();
  } catch {
    return null;
  }
};

const formatApiError = (data: any, fallback: string) => {
  if (data?.error !== "Invalid payload.") {
    return data?.error || fallback;
  }

  const fieldErrors = data?.details?.fieldErrors;
  if (fieldErrors && typeof fieldErrors === "object") {
    for (const [field, errors] of Object.entries(fieldErrors as Record<string, unknown>)) {
      if (Array.isArray(errors) && errors.length > 0 && typeof errors[0] === "string") {
        return `${field}: ${errors[0]}`;
      }
    }
  }

  const formErrors = data?.details?.formErrors;
  if (Array.isArray(formErrors) && formErrors.length > 0 && typeof formErrors[0] === "string") {
    return formErrors[0];
  }

  return data?.error || fallback;
};

const emptyPost = (): PostForm => ({
  title: "",
  slug: "",
  excerpt: "",
  content: "",
  contentMode: "PLAIN",
  coverImageUrl: "",
  seoTitle: "",
  seoDescription: "",
  canonicalUrl: "",
  status: "DRAFT",
  publishAt: "",
  categories: [],
  tags: [],
  clusters: [],
});

const toInputDate = (value?: string | null) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const offset = date.getTimezoneOffset();
  const local = new Date(date.getTime() - offset * 60000);
  return local.toISOString().slice(0, 16);
};

const scheduleDateInput = (hoursFromNow = 24) => {
  const date = new Date(Date.now() + hoursFromNow * 60 * 60 * 1000);
  return toInputDate(date.toISOString());
};

export default function AdminBlogPage({ isAdmin }: Props) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState("posts");
  const [posts, setPosts] = useState<PostListItem[]>([]);
  const [categories, setCategories] = useState<TaxonomyItem[]>([]);
  const [tags, setTags] = useState<TaxonomyItem[]>([]);
  const [clusters, setClusters] = useState<TaxonomyItem[]>([]);
  const [postForm, setPostForm] = useState<PostForm>(emptyPost());
  const [slugTouched, setSlugTouched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [previewMode, setPreviewMode] = useState(false);
  const [previewHtml, setPreviewHtml] = useState("");
  const [dirty, setDirty] = useState(false);
  const [filters, setFilters] = useState({
    search: "",
    status: "",
    category: "",
    tag: "",
    cluster: "",
  });

  useEffect(() => {
    if (!router.isReady) return;
    const tab = typeof router.query.tab === "string" ? router.query.tab : "posts";
    setActiveTab(tab);
  }, [router.isReady, router.query.tab]);

  useEffect(() => {
    void loadTaxonomies();
  }, []);

  useEffect(() => {
    if (activeTab === "posts") {
      void loadPosts();
    }
  }, [activeTab, filters]);

  useEffect(() => {
    if (!slugTouched && postForm.title) {
      setPostForm((prev) => ({ ...prev, slug: slugify(prev.title) }));
    }
  }, [postForm.title, slugTouched]);

  useEffect(() => {
    const handler = (event: BeforeUnloadEvent) => {
      if (!dirty) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  const loadTaxonomies = async () => {
    setError(null);
    try {
      const [catsRes, tagsRes, clustersRes] = await Promise.all([
        fetch("/api/admin/blog/categories"),
        fetch("/api/admin/blog/tags"),
        fetch("/api/admin/blog/clusters"),
      ]);
      const [catsData, tagsData, clustersData] = await Promise.all([
        readJsonSafe(catsRes),
        readJsonSafe(tagsRes),
        readJsonSafe(clustersRes),
      ]);

      const failed = [
        { res: catsRes, data: catsData, label: "categories" },
        { res: tagsRes, data: tagsData, label: "tags" },
        { res: clustersRes, data: clustersData, label: "topic clusters" },
      ].find((entry) => !entry.res.ok);

      if (failed) {
        const apiError =
          typeof failed.data?.error === "string"
            ? failed.data.error
            : `Could not load ${failed.label}.`;
        setError(apiError);
        return;
      }

      setCategories(catsData?.categories || []);
      setTags(tagsData?.tags || []);
      setClusters(clustersData?.clusters || []);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not load taxonomy lists.";
      setError(message);
    }
  };

  const loadPosts = async () => {
    setLoading(true);
    setError(null);
    const query = new URLSearchParams();
    if (filters.search) query.set("search", filters.search);
    if (filters.status) query.set("status", filters.status);
    if (filters.category) query.set("category", filters.category);
    if (filters.tag) query.set("tag", filters.tag);
    if (filters.cluster) query.set("cluster", filters.cluster);
    const res = await fetch(`/api/admin/blog/posts?${query.toString()}`);
    const data = await readJsonSafe(res);
    setLoading(false);
    if (!res.ok) {
      setError(data?.error || "Could not load posts.");
      return;
    }
    const mapped = (data.posts || []).map((post: any) => ({
      id: post.id,
      title: post.title,
      slug: post.slug,
      status: post.status,
      updatedAt: post.updatedAt,
    }));
    setPosts(mapped);
  };

  const resetForm = () => {
    setPostForm(emptyPost());
    setSlugTouched(false);
    setPreviewMode(false);
    setPreviewHtml("");
    setDirty(false);
  };

  const handleEditPost = async (id: string) => {
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/admin/blog/posts/${id}`);
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(data?.error || "Could not load post.");
      return;
    }
    const post = data.post;
    setPostForm({
      id: post.id,
      title: post.title,
      slug: post.slug,
      excerpt: post.excerpt,
      content: post.content,
      contentMode: post.contentMode || "PLAIN",
      coverImageUrl: post.coverImageUrl || "",
      seoTitle: post.seoTitle || "",
      seoDescription: post.seoDescription || "",
      canonicalUrl: post.canonicalUrl || "",
      status: post.status,
      publishAt: toInputDate(post.publishAt || post.publishedAt),
      categories: post.categories.map((item: any) => item.categoryId),
      tags: post.tags.map((item: any) => item.tagId),
      clusters: post.clusters.map((item: any) => ({
        id: item.clusterId,
        isPillar: item.isPillar,
      })),
    });
    setSlugTouched(true);
    setDirty(false);
  };

  const handleDeletePost = async (id: string) => {
    if (!window.confirm("Delete this post?")) return;
    const res = await fetch(`/api/admin/blog/posts/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data?.error || "Could not delete post.");
      return;
    }
    await loadPosts();
  };

  const savePost = async (nextStatus?: PostForm["status"]) => {
    setLoading(true);
    setError(null);
    setStatusMessage(null);

    const targetStatus = nextStatus || postForm.status;
    const resolvedPublishAt =
      targetStatus === "SCHEDULED"
        ? postForm.publishAt || scheduleDateInput(24)
        : postForm.publishAt;

    if (targetStatus === "SCHEDULED" && !postForm.publishAt) {
      setPostForm((prev) => ({
        ...prev,
        status: "SCHEDULED",
        publishAt: resolvedPublishAt,
      }));
    }

    const payload = {
      ...postForm,
      status: targetStatus,
      publishAt: resolvedPublishAt ? new Date(resolvedPublishAt).toISOString() : null,
      clusters: postForm.clusters,
    };

    const res = await fetch(
      postForm.id ? `/api/admin/blog/posts/${postForm.id}` : "/api/admin/blog/posts",
      {
        method: postForm.id ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }
    );
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(formatApiError(data, "Could not save post."));
      return;
    }
    setStatusMessage(postForm.id ? "Post updated." : "Post created.");
    setDirty(false);
    await loadPosts();
    if (!postForm.id) {
      setPostForm((prev) => ({ ...prev, id: data.post.id }));
    }
  };

  const applyQuickSchedule = (hoursFromNow: number) => {
    setPostForm((prev) => ({
      ...prev,
      status: "SCHEDULED",
      publishAt: scheduleDateInput(hoursFromNow),
    }));
    setDirty(true);
  };

  const handlePreview = async () => {
    const rendered =
      postForm.contentMode === "LATEX"
        ? await renderMarkdown(postForm.content, { enableMath: true })
        : await renderPlainText(postForm.content);
    setPreviewHtml(rendered.html);
    setPreviewMode(true);
  };

  const handleTaxonomySave = async (type: "categories" | "tags" | "clusters", form: TaxonomyItem) => {
    const base = `/api/admin/blog/${type}`;
    const res = await fetch(form.id ? `${base}/${form.id}` : base, {
      method: form.id ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: form.name, slug: form.slug, description: form.description }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(formatApiError(data, "Could not save."));
      return;
    }
    await loadTaxonomies();
    setStatusMessage(`${type.slice(0, -1)} saved.`);
  };

  const handleTaxonomyDelete = async (type: "categories" | "tags" | "clusters", id: string) => {
    if (!window.confirm("Delete this item?")) return;
    const res = await fetch(`/api/admin/blog/${type}/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data?.error || "Could not delete.");
      return;
    }
    await loadTaxonomies();
  };

  const previewLink = useMemo(() => {
    if (!postForm.slug) return "";
    return `/api/admin/blog/preview?slug=${encodeURIComponent(postForm.slug)}`;
  }, [postForm.slug]);

  if (!isAdmin) {
    return (
      <main className="page">
        <div className="container stack">
          <h1 className="page-title">Admin access required</h1>
          <Link href="/auth/login" className="button-primary">
            Sign in
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="page admin-blog">
      <Head>
        <title>Blog Admin | Note2Tabs</title>
      </Head>
      <div className="container stack">
        <header className="page-header">
          <div>
            <h1 className="page-title">Blog Admin</h1>
            <p className="page-subtitle">Create, schedule, and organize posts for Note2Tabs.</p>
          </div>
          <div className="admin-header-meta">
            <span>{posts.length} posts</span>
            <span>{categories.length} categories</span>
            <span>{tags.length} tags</span>
            <span>{clusters.length} clusters</span>
          </div>
          <Link href="/" className="button-secondary button-small">
            Back to app
          </Link>
        </header>

        <div className="admin-banner">
          Changes save instantly in your production database. If this page cannot load taxonomy data
          after deployment, run <code>npx prisma migrate deploy</code> for that environment.
        </div>

        <nav className="admin-tabs">
          {["posts", "categories", "tags", "clusters"].map((tab) => (
            <button
              key={tab}
              type="button"
              className={activeTab === tab ? "active" : ""}
              onClick={() => {
                setActiveTab(tab);
                router.replace({ query: { tab } }, undefined, { shallow: true });
              }}
            >
              {tab[0].toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </nav>

        {error && <div className="error">{error}</div>}
        {statusMessage && <div className="success">{statusMessage}</div>}

        {activeTab === "posts" && (
          <div className="admin-grid">
            <section className="admin-panel">
              <div className="panel-header">
                <h2>Posts</h2>
                <button type="button" className="button-secondary button-small" onClick={resetForm}>
                  New post
                </button>
              </div>
              <div className="panel-filters">
                <input
                  type="text"
                  placeholder="Search posts"
                  value={filters.search}
                  onChange={(event) =>
                    setFilters((prev) => ({ ...prev, search: event.target.value }))
                  }
                />
                <select
                  value={filters.status}
                  onChange={(event) => setFilters((prev) => ({ ...prev, status: event.target.value }))}
                >
                  <option value="">All statuses</option>
                  <option value="DRAFT">Draft</option>
                  <option value="SCHEDULED">Scheduled</option>
                  <option value="PUBLISHED">Published</option>
                </select>
                <select
                  value={filters.category}
                  onChange={(event) =>
                    setFilters((prev) => ({ ...prev, category: event.target.value }))
                  }
                >
                  <option value="">All categories</option>
                  {categories.map((category) => (
                    <option key={category.id} value={category.slug}>
                      {category.name}
                    </option>
                  ))}
                </select>
                <select
                  value={filters.tag}
                  onChange={(event) => setFilters((prev) => ({ ...prev, tag: event.target.value }))}
                >
                  <option value="">All tags</option>
                  {tags.map((tag) => (
                    <option key={tag.id} value={tag.slug}>
                      {tag.name}
                    </option>
                  ))}
                </select>
                <select
                  value={filters.cluster}
                  onChange={(event) =>
                    setFilters((prev) => ({ ...prev, cluster: event.target.value }))
                  }
                >
                  <option value="">All clusters</option>
                  {clusters.map((cluster) => (
                    <option key={cluster.id} value={cluster.slug}>
                      {cluster.name}
                    </option>
                  ))}
                </select>
              </div>
              {loading && <p className="muted">Loading...</p>}
              <ul className="admin-list">
                {posts.map((post) => (
                  <li key={post.id}>
                    <div className="admin-item-main">
                      <strong>{post.title}</strong>
                      <div className="admin-item-meta">
                        <span className={`status-pill status-${post.status.toLowerCase()}`}>{post.status}</span>
                        <span className="muted">{new Date(post.updatedAt).toLocaleDateString()}</span>
                      </div>
                    </div>
                    <div className="admin-actions">
                      <button
                        type="button"
                        className="button-secondary button-small"
                        onClick={() => handleEditPost(post.id)}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className="button-secondary button-small"
                        onClick={() => handleDeletePost(post.id)}
                      >
                        Delete
                      </button>
                    </div>
                  </li>
                ))}
                {!loading && posts.length === 0 && (
                  <li className="admin-empty">No posts yet. Click "New post" to create your first article.</li>
                )}
              </ul>
            </section>

            <section className="admin-panel">
              <div className="panel-header">
                <h2>{postForm.id ? "Edit post" : "New post"}</h2>
                <div className="panel-actions">
                  {postForm.slug && (
                  <button
                      type="button"
                      className="button-secondary button-small"
                      onClick={() => window.open(previewLink, "_blank")}
                    >
                      Preview
                    </button>
                  )}
                  <button type="button" className="button-secondary button-small" onClick={handlePreview}>
                    {postForm.contentMode === "LATEX" ? "LaTeX preview" : "Text preview"}
                  </button>
                </div>
              </div>
              <div className="form-grid">
                <label>
                  Title
                  <input
                    type="text"
                    value={postForm.title}
                    onChange={(event) => {
                      setPostForm((prev) => ({ ...prev, title: event.target.value }));
                      setDirty(true);
                    }}
                  />
                </label>
                <label>
                  Slug
                  <input
                    type="text"
                    value={postForm.slug}
                    onChange={(event) => {
                      setSlugTouched(true);
                      setPostForm((prev) => ({ ...prev, slug: event.target.value }));
                      setDirty(true);
                    }}
                  />
                </label>
                <label className="full">
                  Excerpt
                  <textarea
                    value={postForm.excerpt}
                    onChange={(event) => {
                      setPostForm((prev) => ({ ...prev, excerpt: event.target.value }));
                      setDirty(true);
                    }}
                  />
                </label>
                <label>
                  Content mode
                  <select
                    value={postForm.contentMode}
                    onChange={(event) => {
                      setPostForm((prev) => ({
                        ...prev,
                        contentMode: event.target.value as PostForm["contentMode"],
                      }));
                      setDirty(true);
                    }}
                  >
                    <option value="PLAIN">Plain text</option>
                    <option value="LATEX">Markdown + LaTeX</option>
                  </select>
                  <span className="field-hint">
                    Plain text uses paragraph breaks. LaTeX mode supports Markdown with inline math.
                  </span>
                </label>
                <label className="full">
                  {postForm.contentMode === "LATEX"
                    ? "Content (Markdown + LaTeX)"
                    : "Content (Plain text)"}
                  <textarea
                    className="editor"
                    value={postForm.content}
                    placeholder={
                      postForm.contentMode === "LATEX"
                        ? "Use Markdown headings and $inline$ or $$block$$ equations."
                        : "Write plain text. Add a blank line to create a new paragraph."
                    }
                    onChange={(event) => {
                      setPostForm((prev) => ({ ...prev, content: event.target.value }));
                      setDirty(true);
                    }}
                  />
                </label>
                <label className="full">
                  Cover image URL
                  <input
                    type="url"
                    value={postForm.coverImageUrl}
                    onChange={(event) => {
                      setPostForm((prev) => ({ ...prev, coverImageUrl: event.target.value }));
                      setDirty(true);
                    }}
                  />
                </label>
                <label>
                  Status
                  <select
                    value={postForm.status}
                    onChange={(event) => {
                      const status = event.target.value as PostForm["status"];
                      setPostForm((prev) => ({
                        ...prev,
                        status,
                        publishAt:
                          status === "SCHEDULED" && !prev.publishAt
                            ? scheduleDateInput(24)
                            : prev.publishAt,
                      }));
                      setDirty(true);
                    }}
                  >
                    <option value="DRAFT">Draft</option>
                    <option value="SCHEDULED">Scheduled</option>
                    <option value="PUBLISHED">Published</option>
                  </select>
                </label>
                <label>
                  Publish at
                  <input
                    type="datetime-local"
                    value={postForm.publishAt}
                    onChange={(event) => {
                      setPostForm((prev) => ({ ...prev, publishAt: event.target.value }));
                      setDirty(true);
                    }}
                  />
                  <div className="schedule-quick-row">
                    <button type="button" className="button-secondary button-small" onClick={() => applyQuickSchedule(24)}>
                      +24h
                    </button>
                    <button type="button" className="button-secondary button-small" onClick={() => applyQuickSchedule(72)}>
                      +3d
                    </button>
                    <button type="button" className="button-secondary button-small" onClick={() => applyQuickSchedule(168)}>
                      +7d
                    </button>
                    <button
                      type="button"
                      className="button-secondary button-small"
                      onClick={() => {
                        setPostForm((prev) => ({ ...prev, publishAt: "" }));
                        setDirty(true);
                      }}
                    >
                      Clear
                    </button>
                  </div>
                  <span className="field-hint">
                    Local timezone. Scheduled posts auto-fill +24h if publish date is empty.
                  </span>
                </label>
                <label>
                  SEO title
                  <input
                    type="text"
                    value={postForm.seoTitle}
                    onChange={(event) => {
                      setPostForm((prev) => ({ ...prev, seoTitle: event.target.value }));
                      setDirty(true);
                    }}
                  />
                </label>
                <label>
                  SEO description
                  <input
                    type="text"
                    value={postForm.seoDescription}
                    onChange={(event) => {
                      setPostForm((prev) => ({ ...prev, seoDescription: event.target.value }));
                      setDirty(true);
                    }}
                  />
                </label>
                <label className="full">
                  Canonical URL
                  <input
                    type="url"
                    value={postForm.canonicalUrl}
                    onChange={(event) => {
                      setPostForm((prev) => ({ ...prev, canonicalUrl: event.target.value }));
                      setDirty(true);
                    }}
                  />
                </label>
              </div>

              <div className="form-grid">
                <div>
                  <h3>Categories</h3>
                  {categories.map((category) => (
                    <label key={category.id} className="checkbox-row">
                      <input
                        type="checkbox"
                        checked={postForm.categories.includes(category.id)}
                        onChange={(event) => {
                          setPostForm((prev) => ({
                            ...prev,
                            categories: event.target.checked
                              ? [...prev.categories, category.id]
                              : prev.categories.filter((id) => id !== category.id),
                          }));
                          setDirty(true);
                        }}
                      />
                      {category.name}
                    </label>
                  ))}
                </div>
                <div>
                  <h3>Tags</h3>
                  {tags.map((tag) => (
                    <label key={tag.id} className="checkbox-row">
                      <input
                        type="checkbox"
                        checked={postForm.tags.includes(tag.id)}
                        onChange={(event) => {
                          setPostForm((prev) => ({
                            ...prev,
                            tags: event.target.checked
                              ? [...prev.tags, tag.id]
                              : prev.tags.filter((id) => id !== tag.id),
                          }));
                          setDirty(true);
                        }}
                      />
                      {tag.name}
                    </label>
                  ))}
                </div>
              </div>

              <div className="form-grid">
                <div className="full">
                  <h3>Topic clusters</h3>
                  {clusters.map((cluster) => {
                    const selected = postForm.clusters.find((item) => item.id === cluster.id);
                    return (
                      <div key={cluster.id} className="cluster-row">
                        <label className="checkbox-row">
                          <input
                            type="checkbox"
                            checked={Boolean(selected)}
                            onChange={(event) => {
                              setPostForm((prev) => ({
                                ...prev,
                                clusters: event.target.checked
                                  ? [...prev.clusters, { id: cluster.id, isPillar: false }]
                                  : prev.clusters.filter((item) => item.id !== cluster.id),
                              }));
                              setDirty(true);
                            }}
                          />
                          {cluster.name}
                        </label>
                        {selected && (
                          <label className="checkbox-row">
                            <input
                              type="checkbox"
                              checked={selected.isPillar}
                              onChange={(event) => {
                                setPostForm((prev) => ({
                                  ...prev,
                                  clusters: prev.clusters.map((item) =>
                                    item.id === cluster.id
                                      ? { ...item, isPillar: event.target.checked }
                                      : item
                                  ),
                                }));
                                setDirty(true);
                              }}
                            />
                            Pillar post
                          </label>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {previewMode && (
                <div className="markdown-preview">
                  <h3>
                    Preview ({postForm.contentMode === "LATEX" ? "Markdown + LaTeX" : "Plain text"})
                  </h3>
                  <div dangerouslySetInnerHTML={{ __html: previewHtml }} />
                </div>
              )}

              <div className="button-row">
                <button type="button" className="button-secondary" onClick={() => savePost("DRAFT")}>
                  Save draft
                </button>
                <button type="button" className="button-secondary" onClick={() => savePost("SCHEDULED")}>
                  Schedule
                </button>
                <button type="button" className="button-primary" onClick={() => savePost("PUBLISHED")}>
                  Publish now
                </button>
                {postForm.id && (
                  <button
                    type="button"
                    className="button-secondary"
                    onClick={() => savePost("DRAFT")}
                  >
                    Unpublish
                  </button>
                )}
              </div>
            </section>
          </div>
        )}

        {activeTab !== "posts" && (
          <AdminTaxonomyTab
            type={activeTab as "categories" | "tags" | "clusters"}
            items={activeTab === "categories" ? categories : activeTab === "tags" ? tags : clusters}
            onSave={handleTaxonomySave}
            onDelete={handleTaxonomyDelete}
          />
        )}
      </div>
    </main>
  );
}

function AdminTaxonomyTab({
  type,
  items,
  onSave,
  onDelete,
}: {
  type: "categories" | "tags" | "clusters";
  items: TaxonomyItem[];
  onSave: (type: "categories" | "tags" | "clusters", form: TaxonomyItem) => void;
  onDelete: (type: "categories" | "tags" | "clusters", id: string) => void;
}) {
  const [form, setForm] = useState<TaxonomyItem>({ id: "", name: "", slug: "", description: "" });

  return (
    <div className="admin-grid">
      <section className="admin-panel">
        <div className="panel-header">
          <h2>{type[0].toUpperCase() + type.slice(1)}</h2>
        </div>
        <ul className="admin-list">
          {items.map((item) => (
            <li key={item.id}>
              <div className="admin-item-main">
                <strong>{item.name}</strong>
                <span className="muted">/{item.slug}</span>
              </div>
              <div className="admin-actions">
                <button
                  type="button"
                  className="button-secondary button-small"
                  onClick={() =>
                    setForm({
                      id: item.id,
                      name: item.name,
                      slug: item.slug,
                      description: item.description || "",
                    })
                  }
                >
                  Edit
                </button>
                <button
                  type="button"
                  className="button-secondary button-small"
                  onClick={() => onDelete(type, item.id)}
                >
                  Delete
                </button>
              </div>
            </li>
          ))}
          {items.length === 0 && (
            <li className="admin-empty">
              No {type} yet. Create one on the right to organize your content.
            </li>
          )}
        </ul>
      </section>

      <section className="admin-panel">
        <div className="panel-header">
          <h2>{form.id ? "Edit" : "Create"} {type.slice(0, -1)}</h2>
        </div>
        <div className="form-grid">
          <label>
            Name
            <input
              type="text"
              value={form.name}
              onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
            />
          </label>
          <label>
            Slug
            <input
              type="text"
              value={form.slug}
              onChange={(event) => setForm((prev) => ({ ...prev, slug: event.target.value }))}
            />
          </label>
          {type !== "tags" && (
            <label className="full">
              Description
              <textarea
                value={form.description || ""}
                onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))}
              />
            </label>
          )}
        </div>
        <div className="button-row">
          <button type="button" className="button-primary" onClick={() => onSave(type, form)}>
            {form.id ? "Update" : "Create"}
          </button>
          <button
            type="button"
            className="button-secondary"
            onClick={() => setForm({ id: "", name: "", slug: "", description: "" })}
          >
            Clear
          </button>
        </div>
      </section>
    </div>
  );
}

export const getServerSideProps: GetServerSideProps<Props> = async (ctx) => {
  const session = await getServerSession(ctx.req, ctx.res, authOptions);
  const isAdmin = session?.user?.role === "ADMIN";
  if (!isAdmin) {
    return {
      redirect: {
        destination: "/auth/login",
        permanent: false,
      },
    };
  }
  return {
    props: { isAdmin: true },
  };
};
