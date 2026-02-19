import Head from "next/head";
import GteIndexPage, { getServerSideProps } from "../gte/index";

export { getServerSideProps };

export default function EditorRoute() {
  return (
    <>
      <Head>
        <title>Editor | Note2Tabs</title>
        <meta
          name="description"
          content="Edit, simplify, and organize guitar tabs with the Note2Tabs editor. Adjust fingerings, optimize layouts, and practice efficiently."
        />
        <meta property="og:title" content="Editor | Note2Tabs" />
        <meta
          property="og:description"
          content="Edit, simplify, and organize guitar tabs with the Note2Tabs editor. Adjust fingerings, optimize layouts, and practice efficiently."
        />
        <meta name="twitter:title" content="Editor | Note2Tabs" />
        <meta
          name="twitter:description"
          content="Edit, simplify, and organize guitar tabs with the Note2Tabs editor. Adjust fingerings, optimize layouts, and practice efficiently."
        />
      </Head>
      <GteIndexPage />
    </>
  );
}
