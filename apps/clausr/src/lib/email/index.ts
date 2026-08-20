import { Resend } from "resend";

const RESEND_API_KEY = process.env.RESEND_API_KEY ?? "";
const FROM_EMAIL = process.env.RESEND_FROM_EMAIL ?? "noreply@clausr.ai";

let resend: Resend | null = null;

function getResend(): Resend {
  if (!resend) {
    resend = new Resend(RESEND_API_KEY);
  }
  return resend;
}

export async function sendVerificationEmail(
  to: string,
  verificationUrl: string,
): Promise<boolean> {
  if (!RESEND_API_KEY) {
    console.log("\n═══════════════════════════════════════════");
    console.log("📧 Verification URL (dev mode, no RESEND_API_KEY set):");
    console.log(`   ${verificationUrl}`);
    console.log("═══════════════════════════════════════════\n");
    return false;
  }

  const { data, error } = await getResend().emails.send({
    from: FROM_EMAIL,
    to,
    subject: "Verify your email address",
    html: `
      <h1>Verify your email</h1>
      <p>Thanks for signing up! Click the link below to verify your email address:</p>
      <a href="${verificationUrl}" style="display:inline-block;padding:12px 24px;background:#0066ff;color:#fff;text-decoration:none;border-radius:6px;font-weight:600;">
        Verify email
      </a>
      <p style="margin-top:24px;color:#666;font-size:14px;">
        This link expires in 24 hours. If you did not sign up, you can ignore this email.
      </p>
    `,
  });

  if (error) {
    console.error("[email] Resend error:", error);
    return false;
  }

  console.log("[email] Sent successfully, id:", data?.id);
  return true;
}
