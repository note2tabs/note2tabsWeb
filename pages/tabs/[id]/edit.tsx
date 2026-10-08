import { useLocale } from "../../../lib/i18n/react";
import { translatedError } from "../../../lib/i18n/translate";
import type { GetServerSideProps } from "next";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../../api/auth/[...nextauth]";
import NoIndexHead from "../../../components/NoIndexHead";

type Props = {
  error?: string;
};

export default function EditTabRedirect({ error }: Props) {
  const { t, locale } = useLocale();
  if (error) {
    return (
      <>
        <NoIndexHead title="Could not reopen transcription | Note2Tabs" canonicalPath="/tabs" />
      <main className="page">
        <div className="container stack">
          <h1 className="page-title">{t("Could not reopen transcription")}</h1>
          <p className="page-subtitle">{translatedError(error, locale)}</p>
        </div>
      </main>
      </>
    );
  }
  return (
    <>
      <NoIndexHead title="Redirecting | Note2Tabs" canonicalPath="/tabs" />
    <main className="page">
      <div className="container stack">
        <h1 className="page-title">{t("Redirecting...")}</h1>
        <p className="page-subtitle">{t("Opening your transcription review.")}</p>
      </div>
    </main>
    </>
  );
}

export const getServerSideProps: GetServerSideProps<Props> = async (ctx) => {
  const session = await getServerSession(ctx.req, ctx.res, authOptions);
  if (!session?.user?.id) {
    return {
      redirect: {
        destination: `/auth/login?next=${encodeURIComponent(ctx.resolvedUrl || "/tabs")}`,
        permanent: false,
      },
    };
  }

  const id = ctx.params?.id as string;
  const appendEditorId = ctx.query.appendEditorId;
  const destination =
    typeof appendEditorId === "string" && appendEditorId.trim()
      ? `/tabs/${id}?appendEditorId=${encodeURIComponent(appendEditorId)}`
      : `/tabs/${id}`;

  return {
    redirect: {
      destination,
      permanent: false,
    },
  };
};
