import Head from "next/head";
import TranscriberPage from "./transcriber";

export default function TranscribeRoute() {
  return (
    <>
      <Head>
        <title>Transcriber | Note2Tabs</title>
        <meta
          name="description"
          content="Convert audio or YouTube links into guitar tabs with Note2Tabs. Upload a track, generate tabs, and refine them in the browser."
        />
        <meta property="og:title" content="Transcriber | Note2Tabs" />
        <meta
          property="og:description"
          content="Convert audio or YouTube links into guitar tabs with Note2Tabs. Upload a track, generate tabs, and refine them in the browser."
        />
        <meta name="twitter:title" content="Transcriber | Note2Tabs" />
        <meta
          name="twitter:description"
          content="Convert audio or YouTube links into guitar tabs with Note2Tabs. Upload a track, generate tabs, and refine them in the browser."
        />
      </Head>
      <TranscriberPage />
    </>
  );
}
