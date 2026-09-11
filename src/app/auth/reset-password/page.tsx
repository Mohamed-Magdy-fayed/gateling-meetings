import { ResetPasswordForm } from "@/features/core/auth/nextjs/components/reset-password-form";

type ResetPasswordPageProps = {
  searchParams: Promise<{ email?: string }>;
};

export default async function ResetPasswordPage({
  searchParams,
}: ResetPasswordPageProps) {
  const { email } = await searchParams;
  return <ResetPasswordForm initialEmail={email ?? ""} />;
}
