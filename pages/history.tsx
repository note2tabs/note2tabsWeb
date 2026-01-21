import { GetServerSideProps } from "next";

export default function HistoryRedirect() {
  return null;
}

export const getServerSideProps: GetServerSideProps = async () => {
  return {
    redirect: {
      destination: "/account",
      permanent: false,
    },
  };
};
