import type { GetServerSideProps } from "next";

// Preserve old links while consolidating general editor search intent and
// product information on the complete editor landing page.
export default function OnlineGuitarTabEditorRedirect() {
  return null;
}

export const getServerSideProps: GetServerSideProps = async () => ({
  redirect: {
    destination: "/editor",
    permanent: true,
  },
});
