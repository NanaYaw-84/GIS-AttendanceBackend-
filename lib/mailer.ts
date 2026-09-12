import nodemailer from "nodemailer";

export const transporter = nodemailer.createTransport({
  host: "10.10.20.45",
  port: 587,
  secure: false,
  requireTLS: true,
  tls: {
    minVersion: "TLSv1.2",
    rejectUnauthorized: false,
  },
  auth: {
    user: process.env.MAIL_USER,
    pass: process.env.MAIL_PASS,
  },
});
