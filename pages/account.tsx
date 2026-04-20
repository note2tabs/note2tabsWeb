import type { GetServerSideProps } from "next";

export default function AccountPageRedirect() {
  return null;
}

export const getServerSideProps: GetServerSideProps = async () => ({
  redirect: {
    destination: "/settings",
    permanent: false,
  },
});
