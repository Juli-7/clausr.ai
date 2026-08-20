import { sms } from "@volcengine/openapi";

const SMS_ACCOUNT = process.env.VOLC_SMS_ACCOUNT ?? "";
const SMS_SIGN = process.env.VOLC_SMS_SIGN ?? "";
const SMS_TEMPLATE_ID = process.env.VOLC_SMS_TEMPLATE_ID ?? "";
const SMS_SCENE = process.env.VOLC_SMS_SCENE ?? "注册验证码";
const SMS_CODE_TYPE = Number(process.env.VOLC_SMS_CODE_TYPE) || 6;
const SMS_EXPIRE_TIME = Number(process.env.VOLC_SMS_EXPIRE_TIME) || 300;

let smsService: sms.SmsService | null = null;

function getSmsService(): sms.SmsService {
  if (!smsService) {
    smsService = new sms.SmsService();
    smsService.setAccessKeyId(process.env.VOLC_ACCESS_KEY ?? "");
    smsService.setSecretKey(process.env.VOLC_SECRET_KEY ?? "");
    smsService.setRegion(process.env.VOLC_REGION ?? "cn-north-1");
  }
  return smsService;
}

export function isSmsConfigured(): boolean {
  return !!(process.env.VOLC_ACCESS_KEY && process.env.VOLC_SECRET_KEY && SMS_ACCOUNT && SMS_SIGN && SMS_TEMPLATE_ID);
}

export async function sendSmsVerifyCode(
  phoneNumber: string,
  scene: string = SMS_SCENE,
): Promise<{ success: boolean; error?: string }> {
  if (!isSmsConfigured()) {
    if (process.env.NODE_ENV === "production") {
      return { success: false, error: "SMS service not configured" };
    }
    console.log("\n═══════════════════════════════════════════");
    console.log("📱 SMS verification code (dev mode, Volcengine not configured):");
    console.log(`   Phone: ${phoneNumber}, Scene: ${scene}`);
    console.log("═══════════════════════════════════════════\n");
    return { success: true };
  }

  try {
    const svc = getSmsService();
    const result = await svc.SendVerifyCode({
      SmsAccount: SMS_ACCOUNT,
      Sign: SMS_SIGN,
      TemplateID: SMS_TEMPLATE_ID,
      PhoneNumber: phoneNumber,
      Scene: scene,
      CodeType: SMS_CODE_TYPE,
      ExpireTime: SMS_EXPIRE_TIME,
      TryCount: 5,
      Tag: "",
      UserExtCode: "",
    });

    if (result.ResponseMetadata?.Error) {
      const err = result.ResponseMetadata.Error;
      return { success: false, error: `[${err.Code}] ${err.Message}` };
    }

    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to send SMS";
    console.error("[sms] send error:", err);
    return { success: false, error: message };
  }
}

export async function checkSmsVerifyCode(
  phoneNumber: string,
  code: string,
  scene: string = SMS_SCENE,
): Promise<{ success: boolean; error?: string }> {
  if (!isSmsConfigured()) {
    if (process.env.NODE_ENV === "production") {
      return { success: false, error: "SMS service not configured" };
    }
    console.log("\n═══════════════════════════════════════════");
    console.log("📱 SMS check (dev mode, skipping verification):");
    console.log(`   Phone: ${phoneNumber}, Code: ${code}, Scene: ${scene}`);
    console.log("═══════════════════════════════════════════\n");
    return { success: true };
  }

  try {
    const svc = getSmsService();
    const result = await svc.CheckVerifyCode({
      SmsAccount: SMS_ACCOUNT,
      PhoneNumber: phoneNumber,
      Scene: scene,
      Code: code,
    });

    if (result.ResponseMetadata?.Error) {
      const err = result.ResponseMetadata.Error;
      return { success: false, error: `[${err.Code}] ${err.Message}` };
    }

    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to verify code";
    console.error("[sms] check error:", err);
    return { success: false, error: message };
  }
}
