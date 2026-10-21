import type { GetServerSideProps } from "next";
import BlogPostPage from "../blog/[slug]";

export default BlogPostPage;

/** Local review of the public article without credentials or a database connection. */
export const getServerSideProps: GetServerSideProps = async () => {
  if (process.env.NODE_ENV !== "development") return { notFound: true };
  const response = await fetch("https://www.note2tabs.com/blog/note-to-tab-converter-how-to-turn-guitar-notes-into-tablature-online");
  if (!response.ok) return { notFound: true };
  const html = await response.text();
  const data = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
  if (!data) return { notFound: true };
  const props = JSON.parse(data[1]).props?.pageProps;
  if (!props?.post?.contentHtml) return { notFound: true };
  return { props };
};
