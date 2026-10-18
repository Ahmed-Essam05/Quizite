import nodemailer from "nodemailer";

const requiredEmailConfig = [
  "EMAIL_HOST",
  "EMAIL_PORT",
  "EMAIL_USERNAME",
  "EMAIL_PASSWORD",
  "EMAIL_FROM",
];

export const isEmailConfigured = () =>
  requiredEmailConfig.every((key) => Boolean(process.env[key]));

const sendEmail = async ({ to, subject, text }) => {
  if (!isEmailConfigured()) {
    throw new Error("Email delivery is not configured");
  }

  const transporter = nodemailer.createTransport({
    host: process.env.EMAIL_HOST,
    port: Number(process.env.EMAIL_PORT),
    secure: Number(process.env.EMAIL_PORT) === 465,
    auth: {
      user: process.env.EMAIL_USERNAME,
      pass: process.env.EMAIL_PASSWORD,
    },
  });

  await transporter.sendMail({
    from: process.env.EMAIL_FROM,
    to,
    subject,
    text,
  });
};

export default sendEmail;
