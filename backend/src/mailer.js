import nodemailer from "nodemailer";

export function createPasswordResetMailer(environment = process.env) {
  const requiredValues = [
    environment.SMTP_HOST,
    environment.SMTP_USER,
    environment.SMTP_PASSWORD,
    environment.SMTP_FROM,
  ];

  if (requiredValues.some((value) => !value)) {
    return null;
  }

  const transport = nodemailer.createTransport({
    host: environment.SMTP_HOST,
    port: Number(environment.SMTP_PORT ?? 587),
    secure: environment.SMTP_SECURE === "true",
    auth: {
      user: environment.SMTP_USER,
      pass: environment.SMTP_PASSWORD,
    },
  });
  const baseUrl = environment.PASSWORD_RESET_BASE_URL ?? environment.FRONTEND_ORIGIN ?? "http://localhost:5180";

  return async ({ email, token }) => {
    const resetUrl = new URL("/reset-password", baseUrl);
    resetUrl.searchParams.set("token", token);

    await transport.sendMail({
      from: environment.SMTP_FROM,
      to: email,
      subject: "Reset your EduSphere password",
      text: `Use this link to reset your EduSphere password. It expires in 30 minutes:\n\n${resetUrl.toString()}\n\nIf you did not request this, you can ignore this email.`,
    });
  };
}
