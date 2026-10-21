import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
vi.mock("../../lib/prisma", () => ({ prisma: { post: { findMany: vi.fn().mockResolvedValue([]) } } }));
vi.mock("../../lib/prismaRetry", () => ({ withPrismaReadRetry: (fn: () => unknown) => fn() }));
import BassTranscriptionPage from "../../pages/audio-to-bass-tabs";
import BassPage from "../../pages/bass-tab-editor";
import { getServerSideProps } from "../../pages/sitemap.xml";

it("provides one substantive bass task page with direct bass entry and visible FAQs", () => {
  const html = renderToStaticMarkup(createElement(BassPage));
  expect(html).toContain("Free Online Bass Tab Editor");
  expect(html).toContain('href="/gte/new?track=bass"');
  expect(html).toContain("walking basslines");
  expect(html).toContain("E–A–D–G");
  expect(html).toContain("D–A–D–G");
  expect(html.match(/<h1\b/g)).toHaveLength(1);
  expect(html.match(/<details\b/g)).toHaveLength(6);
  expect(html).toContain(encodeURIComponent("/images/editor-previews/bass-editor.png"));
});
it("lists the single English bass page once without invented translated URLs or alternate links", async () => {
  const write = vi.fn();
  await getServerSideProps({ res: { setHeader: vi.fn(), write, end: vi.fn() } } as any);
  const xml = write.mock.calls[0]?.[0] || "";
  expect(xml.match(/<loc>https:\/\/www.note2tabs.com\/bass-tab-editor<\/loc>/g)).toHaveLength(1);
  expect(xml.match(/<loc>https:\/\/www.note2tabs.com\/audio-to-bass-tabs<\/loc>/g)).toHaveLength(1);
  expect(xml).not.toMatch(/\/(?:es|ja|pt-br|ko|ar|pl|zh-hans|fr|it)\/audio-to-bass-tabs/);
  expect(xml).not.toMatch(/\/(?:es|ja|pt-br|ko|ar|pl|zh-hans|fr|it)\/bass-tab-editor/);
});


it("separates bass transcription from manual editing with distinct content and cross-links", () => {
  const html = renderToStaticMarkup(createElement(BassTranscriptionPage));
  expect(html).toContain("Turn bass audio into tabs");
  expect(html).toContain('href="/transcribe"');
  expect(html).toContain('href="/bass-tab-editor"');
  expect(html).toContain("isolated bass stem");
  expect(html.match(/<h1\b/g)).toHaveLength(1);
  const editor = renderToStaticMarkup(createElement(BassPage));
  expect(editor).toContain('href="/audio-to-bass-tabs"');
  expect(editor).not.toContain("Turn a bass recording into tabs");
});
